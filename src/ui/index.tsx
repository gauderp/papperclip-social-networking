import { useCallback, useEffect, useState } from "react";
import {
  useHostLocation,
  useHostNavigation,
  usePluginAction,
  usePluginData,
  type PluginPageProps,
  type PluginRouteSidebarProps,
  type PluginSidebarProps,
  type PluginSettingsPageProps,
} from "@paperclipai/plugin-sdk/ui";
import { NETWORKS, ROUTES } from "../constants.js";

type OverviewData = {
  networks: Array<{ networkKey: string; status: string }>;
};

type NetworkStatusPayload = {
  networkKey: string;
  status: string;
  displayName: string | null;
  connectedAt: string | null;
};

type PostHistoryItem = {
  id: string;
  body: string;
  status: string;
  publishedAt: string | null;
  externalPostId: string | null;
  createdAt: string;
  metrics: {
    likes: number;
    comments: number;
    shares: number;
    impressions: number | null;
    fetchedAt: string | null;
  } | null;
};

type LinkedInHistoryData = {
  posts: PostHistoryItem[];
  lastSync: string | null;
};

type ScheduledPostItem = {
  id: string;
  body: string;
  scheduledAt: string;
  status: string;
  publishedAt: string | null;
  errorMessage: string | null;
};

type LinkedInScheduledData = {
  posts: ScheduledPostItem[];
};

function localDatetimeToIso(value: string): string {
  if (!value) return "";
  return new Date(value).toISOString();
}

function minScheduleDatetimeLocal(): string {
  const d = new Date(Date.now() + 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function companyPluginPath(companyPrefix: string | null | undefined, routePath: string) {
  const prefix = companyPrefix ?? "CUS";
  return `/${prefix}/${routePath}`;
}

export function SidebarLink({ context }: PluginSidebarProps) {
  const navigation = useHostNavigation();
  return (
    <button
      type="button"
      onClick={() => navigation.navigate(companyPluginPath(context.companyPrefix, ROUTES.hub))}
      style={{ width: "100%", textAlign: "left", padding: "0.5rem 0.75rem" }}
    >
      Social Networking
    </button>
  );
}

export function SocialRouteSidebar({ context }: PluginRouteSidebarProps) {
  const navigation = useHostNavigation();
  const { data } = usePluginData<OverviewData>("overview");

  return (
    <nav style={{ display: "grid", gap: "0.25rem", padding: "0.75rem" }}>
      <strong style={{ fontSize: "0.85rem", opacity: 0.8 }}>Social Networking</strong>
      {NETWORKS.map((network) => {
        const status = data?.networks?.find((n) => n.networkKey === network.key)?.status ?? "disconnected";
        return (
          <button
            key={network.key}
            type="button"
            onClick={() =>
              navigation.navigate(companyPluginPath(context.companyPrefix, network.routePath))
            }
            style={{ textAlign: "left", padding: "0.4rem 0.5rem" }}
          >
            {network.label}
            <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", opacity: 0.7 }}>
              ({status})
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function SocialHubPage({ context }: PluginPageProps) {
  const navigation = useHostNavigation();
  const { data, loading, error } = usePluginData<OverviewData>("overview");

  if (loading) return <div style={{ padding: "1.5rem" }}>Carregando redes...</div>;
  if (error) return <div style={{ padding: "1.5rem" }}>Erro: {error.message}</div>;

  return (
    <div style={{ padding: "1.5rem", display: "grid", gap: "1rem", maxWidth: 720 }}>
      <h1 style={{ margin: 0 }}>Social Networking</h1>
      <p style={{ margin: 0, opacity: 0.85 }}>
        Conecte contas, agende publicacoes e acompanhe metricas. Comece pelo LinkedIn.
      </p>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {NETWORKS.map((network) => {
          const status = data?.networks?.find((n) => n.networkKey === network.key)?.status ?? "disconnected";
          return (
            <div
              key={network.key}
              style={{
                border: "1px solid rgba(128,128,128,0.35)",
                borderRadius: 8,
                padding: "1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <strong>{network.label}</strong>
                <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>Status: {status}</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  navigation.navigate(companyPluginPath(context.companyPrefix, network.routePath))
                }
              >
                Abrir
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LinkedInPage({ context }: PluginPageProps) {
  const location = useHostLocation();
  const navigation = useHostNavigation();
  const { data, loading, error, refresh } = usePluginData<OverviewData>("overview");
  const startOAuth = usePluginAction("linkedin-start-oauth");
  const completeOAuth = usePluginAction("linkedin-complete-oauth");
  const disconnect = usePluginAction("linkedin-disconnect");
  const syncMetrics = usePluginAction("sync-linkedin-metrics");
  const schedulePost = usePluginAction("schedule-linkedin-post");
  const cancelScheduled = usePluginAction("cancel-scheduled-post");
  const {
    data: history,
    loading: historyLoading,
    error: historyError,
    refresh: refreshHistory,
  } = usePluginData<LinkedInHistoryData>("linkedin-history");
  const {
    data: scheduledData,
    loading: scheduledLoading,
    error: scheduledError,
    refresh: refreshScheduled,
  } = usePluginData<LinkedInScheduledData>("linkedin-scheduled-posts");

  const [busy, setBusy] = useState(false);
  const [scheduleBody, setScheduleBody] = useState("");
  const [scheduleAtLocal, setScheduleAtLocal] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const status = data?.networks?.find((n) => n.networkKey === "linkedin")?.status ?? "disconnected";
  const companyId = context.companyId ?? "";
  const companyPrefix = context.companyPrefix ?? "CUS";

  useEffect(() => {
    if (!companyId || typeof window === "undefined") return;

    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");

    if (oauthError) {
      setActionError(`LinkedIn recusou a autorizacao: ${oauthError}`);
      navigation.navigate(companyPluginPath(companyPrefix, ROUTES.linkedin));
      return;
    }

    if (!code || !state) return;

    let cancelled = false;
    setBusy(true);
    setActionError(null);

    void completeOAuth({
      companyId,
      code,
      state,
      publicOrigin: window.location.origin,
      companyPrefix,
    })
      .then((result) => {
        if (cancelled) return;
        const payload = result as {
          ok: boolean;
          error?: string;
          status?: NetworkStatusPayload;
        };
        if (!payload.ok) {
          setActionError(payload.error ?? "Falha ao conectar conta LinkedIn.");
        } else {
          setActionInfo(
            payload.status?.displayName
              ? `Conta conectada: ${payload.status.displayName}`
              : "Conta LinkedIn conectada.",
          );
        }
        void refresh();
        navigation.navigate(companyPluginPath(companyPrefix, ROUTES.linkedin));
      })
      .catch((err: Error) => {
        if (!cancelled) setActionError(err.message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, companyPrefix, completeOAuth, location.search, navigation, refresh]);

  async function handleConnect() {
    if (!companyId || typeof window === "undefined") return;
    setBusy(true);
    setActionError(null);
    setActionInfo(null);
    try {
      const result = (await startOAuth({
        companyId,
        publicOrigin: window.location.origin,
        companyPrefix,
      })) as { authorizeUrl: string };
      window.location.assign(result.authorizeUrl);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const handleSyncMetrics = useCallback(async () => {
    if (!companyId) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = (await syncMetrics({ companyId })) as {
        synced?: number;
        errors?: number;
        reason?: string;
      };
      if (result.reason === "not_connected") {
        setSyncMessage("Conecte a conta LinkedIn para buscar metricas na API.");
      } else if (result.reason === "no_posts") {
        setSyncMessage("Nenhum post publicado com ID externo para sincronizar.");
      } else {
        setSyncMessage(
          `Sync: ${result.synced ?? 0} atualizado(s), ${result.errors ?? 0} erro(s).`,
        );
      }
      refreshHistory();
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Falha ao sincronizar.");
    } finally {
      setSyncing(false);
    }
  }, [companyId, syncMetrics, refreshHistory]);

  async function handleSchedulePost() {
    if (!companyId) return;
    setScheduling(true);
    setScheduleMessage(null);
    try {
      await schedulePost({
        companyId,
        body: scheduleBody,
        scheduledAt: localDatetimeToIso(scheduleAtLocal),
      });
      setScheduleBody("");
      setScheduleAtLocal("");
      setScheduleMessage("Publicacao agendada com sucesso.");
      await refreshScheduled();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const labels: Record<string, string> = {
        body_required: "Informe o texto do post.",
        scheduled_at_required: "Informe data e hora.",
        scheduled_at_invalid: "Data/hora invalida.",
        scheduled_at_must_be_future: "Agende para um horario no futuro.",
      };
      setScheduleMessage(labels[message] ?? message);
    } finally {
      setScheduling(false);
    }
  }

  async function handleCancelScheduled(postId: string) {
    if (!companyId) return;
    setScheduling(true);
    setScheduleMessage(null);
    try {
      await cancelScheduled({ companyId, postId });
      setScheduleMessage("Agendamento cancelado.");
      await refreshScheduled();
    } catch (err) {
      setScheduleMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setScheduling(false);
    }
  }

  async function handleDisconnect() {
    if (!companyId) return;
    setBusy(true);
    setActionError(null);
    setActionInfo(null);
    try {
      await disconnect({ companyId });
      setActionInfo("Conta LinkedIn desconectada.");
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div style={{ padding: "1.5rem" }}>Carregando LinkedIn...</div>;
  if (error) return <div style={{ padding: "1.5rem" }}>Erro: {error.message}</div>;

  return (
    <div style={{ padding: "1.5rem", display: "grid", gap: "1rem", maxWidth: 900 }}>
      <h1 style={{ margin: 0 }}>LinkedIn</h1>
      <p style={{ margin: 0, opacity: 0.85 }}>
        Conexao OAuth, agendamento de posts e historico com curtidas/comentarios/analises.
      </p>

      {actionError ? (
        <div style={{ color: "#b91c1c", fontSize: "0.9rem" }}>{actionError}</div>
      ) : null}
      {actionInfo ? (
        <div style={{ color: "#166534", fontSize: "0.9rem" }}>{actionInfo}</div>
      ) : null}

      <section style={{ display: "grid", gap: "0.5rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Conexao</h2>
        <div>
          Status da conta: <strong>{status}</strong>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={busy || status === "connected"}
            onClick={() => void handleConnect()}
          >
            {busy ? "Conectando..." : "Conectar conta LinkedIn"}
          </button>
          <button
            type="button"
            disabled={busy || status === "disconnected"}
            onClick={() => void handleDisconnect()}
          >
            Desconectar
          </button>
        </div>
        <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.65 }}>
          Redirect OAuth:{" "}
          {typeof window !== "undefined"
            ? `${window.location.origin}/${companyPrefix}/${ROUTES.linkedin}`
            : `/${companyPrefix}/${ROUTES.linkedin}`}
          . Registre esta URL no app LinkedIn Developer.
        </p>
      </section>

      <section style={{ display: "grid", gap: "0.5rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Agendar publicacao</h2>
        <textarea
          placeholder="Texto do post"
          rows={4}
          style={{ width: "100%" }}
          value={scheduleBody}
          onChange={(e) => setScheduleBody(e.target.value)}
          disabled={scheduling}
        />
        <input
          type="datetime-local"
          min={minScheduleDatetimeLocal()}
          value={scheduleAtLocal}
          onChange={(e) => setScheduleAtLocal(e.target.value)}
          disabled={scheduling}
        />
        <button
          type="button"
          disabled={scheduling || !scheduleBody.trim() || !scheduleAtLocal}
          onClick={() => void handleSchedulePost()}
        >
          {scheduling ? "Salvando..." : "Agendar publicacao"}
        </button>
        {scheduleMessage ? (
          <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.8 }}>{scheduleMessage}</p>
        ) : null}
        {status !== "connected" ? (
          <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.65 }}>
            A publicacao no horario agendada exige conta LinkedIn conectada (OAuth).
          </p>
        ) : null}
        {scheduledLoading ? (
          <p style={{ margin: 0, opacity: 0.75 }}>Carregando agendamentos...</p>
        ) : scheduledError ? (
          <p style={{ margin: 0 }}>Erro: {scheduledError.message}</p>
        ) : (scheduledData?.posts ?? []).length === 0 ? (
          <p style={{ margin: 0, opacity: 0.75 }}>Nenhum post agendado.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "grid", gap: "0.5rem" }}>
            {(scheduledData?.posts ?? []).map((post) => (
              <li key={post.id}>
                <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>
                  {formatWhen(post.scheduledAt)} · {post.status}
                  {post.errorMessage ? ` — ${post.errorMessage}` : ""}
                </div>
                <p style={{ margin: "0.25rem 0 0", whiteSpace: "pre-wrap" }}>{post.body}</p>
                {post.status === "pending" ? (
                  <button
                    type="button"
                    style={{ marginTop: "0.35rem" }}
                    disabled={scheduling}
                    onClick={() => void handleCancelScheduled(post.id)}
                  >
                    Cancelar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ display: "grid", gap: "0.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Historico e metricas</h2>
          <button
            type="button"
            disabled={busy || syncing}
            onClick={() => void handleSyncMetrics()}
          >
            {syncing ? "Sincronizando..." : "Sincronizar agora"}
          </button>
        </div>
        {history?.lastSync ? (
          <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.65 }}>
            Ultima sincronizacao: {formatWhen(history.lastSync)}
          </p>
        ) : null}
        {syncMessage ? (
          <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.8 }}>{syncMessage}</p>
        ) : null}
        {historyLoading ? (
          <p style={{ margin: 0, opacity: 0.75 }}>Carregando historico...</p>
        ) : historyError ? (
          <p style={{ margin: 0 }}>Erro: {historyError.message}</p>
        ) : (history?.posts ?? []).length === 0 ? (
          <p style={{ margin: 0, opacity: 0.75 }}>
            Nenhum post publicado ainda. Apos publicar, use Sincronizar agora para atualizar curtidas e comentarios.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {(history?.posts ?? []).map((post) => (
              <article
                key={post.id}
                style={{
                  border: "1px solid rgba(128,128,128,0.35)",
                  borderRadius: 8,
                  padding: "0.75rem 1rem",
                  display: "grid",
                  gap: "0.5rem",
                }}
              >
                <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>
                  {formatWhen(post.publishedAt ?? post.createdAt)} · {post.status}
                </div>
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{post.body}</p>
                {post.metrics ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", fontSize: "0.85rem" }}>
                    <span>Curtidas: <strong>{post.metrics.likes}</strong></span>
                    <span>Comentarios: <strong>{post.metrics.comments}</strong></span>
                    <span>Compartilhamentos: <strong>{post.metrics.shares}</strong></span>
                    {post.metrics.impressions != null ? (
                      <span>Impressoes: <strong>{post.metrics.impressions}</strong></span>
                    ) : null}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.65 }}>
                    Metricas pendentes — sincronize apos conectar a conta.
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.6 }}>
        Empresa: {companyId || "—"}
      </p>
    </div>
  );
}

export function SettingsPage(_props: PluginSettingsPageProps) {
  return (
    <div style={{ padding: "1rem", display: "grid", gap: "0.75rem", maxWidth: 640 }}>
      <h2 style={{ margin: 0 }}>Social Networking — configuracao da instancia</h2>
      <p style={{ margin: 0, opacity: 0.85 }}>
        Defina secret refs do app LinkedIn nas configuracoes do plugin (instance settings):
        linkedinClientIdSecretRef e linkedinClientSecretSecretRef.
      </p>
    </div>
  );
}
