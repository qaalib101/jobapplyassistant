import { ChangeEvent, useEffect, useMemo, useState } from "react";

interface Profile {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
  work_authorization?: string | null;
  sponsorship_required?: boolean | null;
  updated_at?: string;
}

interface ContextDocument {
  title?: string;
  content?: string;
  is_active?: boolean;
  updated_at?: string;
}

interface ResumeVersion {
  id: string;
  label: string;
  file_name?: string | null;
  parsed_text?: string | null;
  updated_at?: string;
}

interface AnswerBankItem {
  id: string;
  question_text: string;
  answer_text: string;
  tags?: string[];
}

interface AiProvider {
  id: string;
  label: string;
  mode: string;
  configured: boolean;
}

interface ProviderStatus {
  activeProvider: string;
  fallbackProvider: string;
  availableProviders: AiProvider[];
}

interface DataSources {
  profile: Profile;
  context: ContextDocument;
  resumes: ResumeVersion[];
  answers: AnswerBankItem[];
  providers: ProviderStatus;
}

const defaultTitle = "General AI context";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`);
  return response.json() as Promise<T>;
}

function formatDate(value?: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatValue(value: unknown) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return "Not set";
  return String(value);
}

function FieldRow({ label, value }: { label: string; value: unknown }) {
  return (
    <>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-slate-900">{formatValue(value)}</dd>
    </>
  );
}

function SourceList({
  emptyText,
  items,
}: {
  emptyText: string;
  items: Array<{ title: string; meta: string }>;
}) {
  if (!items.length) return <p className="text-sm text-slate-500">{emptyText}</p>;

  return (
    <div className="grid gap-2">
      {items.map((item, index) => (
        <div key={`${item.title}-${index}`} className="border-t border-slate-200 pt-2 first:border-t-0 first:pt-0">
          <div className="font-medium text-slate-900">{item.title}</div>
          <div className="break-words text-xs text-slate-500">{item.meta}</div>
        </div>
      ))}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">{children}</section>;
}

export function App() {
  const [contextTitle, setContextTitle] = useState(defaultTitle);
  const [contextText, setContextText] = useState("");
  const [contextStatus, setContextStatus] = useState("Loading saved context...");
  const [resumeLabel, setResumeLabel] = useState("Base resume");
  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState<string | undefined>();
  const [resumeStatus, setResumeStatus] = useState("No resume loaded.");
  const [sourcesStatus, setSourcesStatus] = useState("Loading data sources...");
  const [sources, setSources] = useState<DataSources | null>(null);
  const [savingContext, setSavingContext] = useState(false);
  const [savingResume, setSavingResume] = useState(false);
  const [loadingSources, setLoadingSources] = useState(false);

  async function loadContext() {
    try {
      const context = await api<ContextDocument>("/api/context");
      setContextTitle(context.title || defaultTitle);
      setContextText(context.content || "");
      setContextStatus("Saved context loaded.");
    } catch (error) {
      setContextStatus(error instanceof Error ? error.message : "Could not load context.");
    }
  }

  async function loadDataSources() {
    setLoadingSources(true);
    setSourcesStatus("Loading data sources...");
    try {
      const [profile, context, resumes, answers, providers] = await Promise.all([
        api<Profile>("/api/profile"),
        api<ContextDocument>("/api/context"),
        api<ResumeVersion[]>("/api/resume-versions"),
        api<AnswerBankItem[]>("/api/answer-bank"),
        api<ProviderStatus>("/api/ai/providers"),
      ]);
      setSources({ profile, context, resumes, answers, providers });
      setSourcesStatus("Data sources loaded.");
    } catch (error) {
      setSourcesStatus(error instanceof Error ? error.message : "Could not load data sources.");
    } finally {
      setLoadingSources(false);
    }
  }

  async function saveContext() {
    setSavingContext(true);
    setContextStatus("Saving...");
    try {
      const saved = await api<ContextDocument>("/api/context", {
        method: "PUT",
        body: JSON.stringify({
          title: contextTitle || defaultTitle,
          content: contextText,
          tags: ["general"],
        }),
      });
      setContextStatus(`Saved ${(saved.content?.length ?? 0).toLocaleString()} characters.`);
      await loadDataSources();
    } catch (error) {
      setContextStatus(error instanceof Error ? error.message : "Could not save context.");
    } finally {
      setSavingContext(false);
    }
  }

  async function saveResume() {
    if (!resumeText.trim()) {
      setResumeStatus("Paste or upload resume text first.");
      return;
    }

    setSavingResume(true);
    setResumeStatus("Saving resume...");
    try {
      const saved = await api<ResumeVersion>("/api/resume-versions", {
        method: "POST",
        body: JSON.stringify({
          label: resumeLabel || "Base resume",
          parsedText: resumeText,
          fileName: resumeFileName,
          metadata: { source: "companion_ui" },
        }),
      });
      setResumeStatus(`Saved resume: ${saved.label}`);
      await loadDataSources();
    } catch (error) {
      setResumeStatus(error instanceof Error ? error.message : "Could not save resume.");
    } finally {
      setSavingResume(false);
    }
  }

  async function loadResumeFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.(txt|md|text)$/i.test(file.name)) {
      setResumeStatus("This MVP supports text and Markdown resume files.");
      return;
    }
    setResumeFileName(file.name);
    setResumeLabel(file.name.replace(/\.(txt|md|text)$/i, ""));
    setResumeText(await file.text());
    setResumeStatus(`Loaded ${file.name}. Save it to use in the extension.`);
  }

  useEffect(() => {
    void loadContext();
    void loadDataSources();
  }, []);

  const profileRows = useMemo(() => {
    const profile = sources?.profile ?? {};
    return [
      ["Name", profile.full_name],
      ["Email", profile.email],
      ["Phone", profile.phone],
      ["Location", profile.location],
      ["LinkedIn", profile.linkedin_url],
      ["GitHub", profile.github_url],
      ["Portfolio", profile.portfolio_url],
      ["Work auth", profile.work_authorization],
      ["Sponsorship", profile.sponsorship_required],
      ["Updated", profile.updated_at],
    ] as Array<[string, unknown]>;
  }, [sources]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-normal text-slate-950">Job Apply Assistant</h1>
          <p className="mt-1 text-slate-600">
            Manage the context, profile data, resumes, and provider state used by the application assistant.
          </p>
        </div>
        <nav className="flex gap-4 text-sm font-medium">
          <a className="text-blue-700 hover:text-blue-900" href="/demos/">
            Demos
          </a>
          <a className="text-blue-700 hover:text-blue-900" href="/api/health">
            API
          </a>
        </nav>
      </header>

      <div className="grid gap-5">
        <Panel>
          <label className="mb-2 block font-semibold" htmlFor="contextTitle">
            Title
          </label>
          <input
            id="contextTitle"
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
            type="text"
            value={contextTitle}
            onChange={(event) => setContextTitle(event.target.value)}
          />

          <label className="mb-2 block font-semibold" htmlFor="contextText">
            AI context
          </label>
          <textarea
            id="contextText"
            className="min-h-[48vh] w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-700"
            spellCheck
            placeholder="Paste your resume text, career summary, preferred roles, work authorization, compensation preferences, projects, achievements, reusable answers, and anything else the AI should know."
            value={contextText}
            onChange={(event) => setContextText(event.target.value)}
          />

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">{contextStatus}</div>
            <button
              className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={savingContext}
              onClick={saveContext}
            >
              Save context
            </button>
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Data Sources Preview</h2>
              <p className="mt-1 text-sm text-slate-600">
                Review what the assistant will use before scanning application pages.
              </p>
            </div>
            <button
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={loadingSources}
              onClick={loadDataSources}
            >
              Refresh
            </button>
          </div>

          <div className="mb-3 text-sm text-slate-600">{sourcesStatus}</div>
          <div className="grid gap-3 lg:grid-cols-2">
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 font-semibold text-slate-950">Profile</h3>
              <dl className="grid grid-cols-[minmax(92px,0.42fr)_1fr] gap-x-3 gap-y-2">
                {profileRows.map(([label, value]) => (
                  <FieldRow key={label} label={label} value={value} />
                ))}
              </dl>
            </article>

            <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 font-semibold text-slate-950">Context</h3>
              <dl className="grid grid-cols-[minmax(92px,0.42fr)_1fr] gap-x-3 gap-y-2">
                <FieldRow label="Title" value={sources?.context.title} />
                <FieldRow label="Characters" value={sources?.context.content?.length.toLocaleString()} />
                <FieldRow label="Active" value={sources?.context.is_active ?? Boolean(sources?.context.content)} />
                <FieldRow label="Updated" value={sources?.context.updated_at} />
              </dl>
            </article>

            <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 font-semibold text-slate-950">Resumes</h3>
              <SourceList
                emptyText="No saved resumes."
                items={(sources?.resumes ?? []).slice(0, 5).map((resume) => ({
                  title: resume.label || "Resume",
                  meta: `${(resume.parsed_text?.length ?? 0).toLocaleString()} chars · ${
                    resume.file_name || "manual text"
                  } · ${formatDate(resume.updated_at)}`,
                }))}
              />
            </article>

            <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 font-semibold text-slate-950">Answer Bank</h3>
              <SourceList
                emptyText="No saved answers."
                items={(sources?.answers ?? []).slice(0, 5).map((answer) => ({
                  title: answer.question_text,
                  meta: `${answer.answer_text.length.toLocaleString()} chars · ${
                    answer.tags?.join(", ") || "no tags"
                  }`,
                }))}
              />
            </article>

            <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 font-semibold text-slate-950">AI Providers</h3>
              <SourceList
                emptyText="No providers configured."
                items={(sources?.providers.availableProviders ?? []).map((provider) => ({
                  title:
                    provider.id === sources?.providers.activeProvider
                      ? `${provider.label} active`
                      : provider.label,
                  meta: `${provider.mode} · ${provider.configured ? "configured" : "not configured"}${
                    provider.id === sources?.providers.fallbackProvider ? " · fallback" : ""
                  }`,
                }))}
              />
            </article>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-lg font-semibold text-slate-950">Resume Workspace</h2>
          <p className="mt-1 text-sm text-slate-600">
            Upload a text resume or construct one here. It will be available to the extension side panel.
          </p>

          <label className="mb-2 mt-4 block font-semibold" htmlFor="resumeFile">
            Resume file
          </label>
          <input
            id="resumeFile"
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            type="file"
            accept=".txt,.md,.text"
            onChange={loadResumeFile}
          />

          <label className="mb-2 block font-semibold" htmlFor="resumeLabel">
            Resume label
          </label>
          <input
            id="resumeLabel"
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
            type="text"
            value={resumeLabel}
            onChange={(event) => setResumeLabel(event.target.value)}
          />

          <label className="mb-2 block font-semibold" htmlFor="resumeText">
            Resume text
          </label>
          <textarea
            id="resumeText"
            className="min-h-48 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-700"
            spellCheck
            placeholder="Paste or build the resume you want to use for tailoring."
            value={resumeText}
            onChange={(event) => setResumeText(event.target.value)}
          />

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">{resumeStatus}</div>
            <button
              className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={savingResume}
              onClick={saveResume}
            >
              Save resume
            </button>
          </div>
        </Panel>
      </div>
    </main>
  );
}
