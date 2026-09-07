import { readFileSync } from "node:fs";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MessageListener = (
  message: { type: string; fields?: Array<{ fieldId: string; value: string }> },
  sender: unknown,
  sendResponse: (response: any) => void,
) => boolean;

function runContentScript(fileName: string) {
  const source = readFileSync(new URL(fileName, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  window.eval(javascript);
}

function installChromeMock() {
  let listener: MessageListener | undefined;
  Object.defineProperty(window, "chrome", {
    configurable: true,
    value: {
      runtime: {
        onMessage: {
          addListener: vi.fn((next: MessageListener) => {
            listener = next;
          }),
        },
      },
    },
  });
  return () => {
    if (!listener) throw new Error("Content script did not register a message listener.");
    return listener;
  };
}

function send(listener: MessageListener, message: Parameters<MessageListener>[0]) {
  let response: any;
  listener(message, {}, (value) => {
    response = value;
  });
  return response;
}

function sendAsync(listener: MessageListener, message: Parameters<MessageListener>[0]) {
  return new Promise<any>((resolve) => {
    listener(message, {}, resolve);
  });
}

describe("real scanner and filler scripts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 120,
      height: 24,
      top: 0,
      right: 120,
      bottom: 24,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    Object.defineProperty(window, "CSS", {
      configurable: true,
      value: {
        escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&"),
      },
    });
    runContentScript("./fieldPolicy.ts");
    runContentScript("./controlSupport.ts");
  });

  it("classifies protected fields and preserves current field state", () => {
    document.body.innerHTML = `
      <label>Email <input name="email" type="email" value="ada@example.com" /></label>
      <label>Gender <select name="gender"><option value="">Choose</option></select></label>
      <label>Age Bracket <select name="age"><option value="">Choose</option></select></label>
      <label>Password <input name="password" type="password" /></label>
      <label>Agree <input name="agree" type="checkbox" checked /></label>
    `;
    const getListener = installChromeMock();
    runContentScript("./scanner.ts");

    const response = send(getListener(), { type: "SCAN_VISIBLE_FIELDS" });
    const byName = new Map(response.fields.map((field: any) => [field.name, field]));

    expect(byName.get("email")).toMatchObject({ sensitivity: "normal", currentValue: "ada@example.com" });
    expect(byName.get("gender")).toMatchObject({ sensitivity: "sensitive", category: "gender" });
    expect(byName.get("age")).toMatchObject({ sensitivity: "sensitive", category: "personal" });
    expect(byName.get("password")).toMatchObject({ sensitivity: "manual-only", category: "personal" });
    expect(byName.get("agree")).toMatchObject({ checked: true });
  });

  it("fills explicitly selected protected fields but blocks manual-only fields", async () => {
    document.body.innerHTML = `
      <label>Email <input name="email" type="email" /></label>
      <label>Gender <select name="gender"><option value="">Choose</option><option value="nonbinary">Non-binary</option></select></label>
      <label>SSN <input name="ssn" type="text" /></label>
    `;
    let getListener = installChromeMock();
    runContentScript("./scanner.ts");
    const scan = send(getListener(), { type: "SCAN_VISIBLE_FIELDS" });
    const ids = new Map(scan.fields.map((field: any) => [field.name, field.fieldId]));

    getListener = installChromeMock();
    runContentScript("./filler.ts");
    const response = await sendAsync(getListener(), {
      type: "FILL_SELECTED_FIELDS",
      fields: [
        { fieldId: ids.get("email"), value: "ada@example.com" },
        { fieldId: ids.get("gender"), value: "Non-binary" },
        { fieldId: ids.get("ssn"), value: "000-00-0000" },
      ],
    });

    expect(response.results).toEqual([
      { fieldId: ids.get("email"), filled: true },
      { fieldId: ids.get("gender"), filled: true },
      { fieldId: ids.get("ssn"), filled: false, skipped: "manual-only" },
    ]);
    expect((document.querySelector('[name="email"]') as HTMLInputElement).value).toBe("ada@example.com");
    expect((document.querySelector('[name="gender"]') as HTMLSelectElement).value).toBe("nonbinary");
    expect((document.querySelector('[name="ssn"]') as HTMLInputElement).value).toBe("");
  });

  it("scans and fills the checked-in Greenhouse demo form", async () => {
    document.documentElement.innerHTML = readFileSync(
      "../frontend/public/demos/greenhouse.html",
      "utf8",
    );
    let getListener = installChromeMock();
    runContentScript("./scanner.ts");
    const scan = send(getListener(), { type: "SCAN_VISIBLE_FIELDS" });

    expect(scan.fields).toHaveLength(10);
    const firstName = scan.fields.find((field: any) => field.name === "first_name");
    const interest = scan.fields.find((field: any) => field.name === "interest");
    expect(firstName).toMatchObject({ required: true, sensitivity: "normal", category: "contact" });
    expect(interest).toMatchObject({ type: "textarea", sensitivity: "normal" });

    getListener = installChromeMock();
    runContentScript("./filler.ts");
    const response = await sendAsync(getListener(), {
      type: "FILL_SELECTED_FIELDS",
      fields: [{ fieldId: firstName.fieldId, value: "Ada" }],
    });

    expect(response.results).toEqual([{ fieldId: firstName.fieldId, filled: true }]);
    expect((document.querySelector('[name="first_name"]') as HTMLInputElement).value).toBe("Ada");
  });

  it("isolates labels and fills button and searchable ARIA comboboxes", async () => {
    document.body.innerHTML = `
      <section>
        <h2>Personal Details We'll need these details to contact you. Apply with LinkedIn</h2>
        <div class="field" data-field>
          <label id="country-label">Country</label>
          <button id="country" data-name="country" role="combobox" aria-labelledby="country-label" aria-controls="country-options">Select...</button>
          <div id="country-options" role="listbox" hidden>
            <button role="option" data-option-value="US">United States</button>
            <button role="option" data-option-value="CA">Canada</button>
          </div>
        </div>
        <div class="field" data-field>
          <label id="location-label">Current Location</label>
          <input id="location" data-name="location" role="combobox" aria-labelledby="location-label" aria-controls="location-options" />
          <div id="location-options" role="listbox" hidden>
            <button role="option" data-option-value="chicago">Chicago, IL</button>
            <button role="option" data-option-value="boston">Boston, MA</button>
          </div>
        </div>
      </section>
    `;
    for (const combobox of Array.from(document.querySelectorAll<HTMLElement>("[role='combobox']"))) {
      combobox.addEventListener("click", () => {
        const list = document.getElementById(combobox.getAttribute("aria-controls") ?? "");
        if (list) list.hidden = false;
      });
    }
    for (const option of Array.from(document.querySelectorAll<HTMLElement>("[role='option']"))) {
      option.addEventListener("click", () => {
        const list = option.closest<HTMLElement>("[role='listbox']");
        const combobox = document.querySelector<HTMLElement>(`[aria-controls='${list?.id}']`);
        if (combobox instanceof HTMLInputElement) combobox.value = option.textContent?.trim() ?? "";
        else if (combobox) combobox.dataset.value = option.dataset.optionValue;
        if (list) list.hidden = true;
      });
    }

    let getListener = installChromeMock();
    runContentScript("./scanner.ts");
    const scan = send(getListener(), { type: "SCAN_VISIBLE_FIELDS" });
    expect(scan.fields).toHaveLength(2);
    expect(scan.fields.map((field: any) => field.label)).toEqual(["Country", "Current Location"]);
    expect(scan.fields[0]).toMatchObject({ name: "country", type: "select", options: [
      { label: "United States", value: "US" },
      { label: "Canada", value: "CA" },
    ] });

    getListener = installChromeMock();
    runContentScript("./filler.ts");
    const response = await sendAsync(getListener(), {
      type: "FILL_SELECTED_FIELDS",
      fields: [
        { fieldId: scan.fields[0].fieldId, value: "USA" },
        { fieldId: scan.fields[1].fieldId, value: "chicago" },
      ],
    });

    expect(response.results.every((result: any) => result.filled)).toBe(true);
    expect(document.getElementById("country")?.dataset.value).toBe("US");
    expect((document.getElementById("location") as HTMLInputElement).value).toBe("Chicago, IL");

    const failed = await sendAsync(getListener(), {
      type: "FILL_SELECTED_FIELDS",
      fields: [{ fieldId: scan.fields[1].fieldId, value: "Atlantis" }],
    });
    expect(failed.results).toEqual([{ fieldId: scan.fields[1].fieldId, filled: false }]);
    expect((document.getElementById("location") as HTMLInputElement).value).toBe("Chicago, IL");
  });
});
