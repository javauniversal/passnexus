import { Fragment, useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  TextField,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  createTheme,
} from "@mui/material";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Contact,
  Copy,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  LockKeyhole,
  LogOut,
  PanelLeft,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Star,
  StickyNote,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import {
  createRecipientDocumentKeyEnvelope,
  createMasterPasswordEnvelope,
  createRecoveryVaultEnvelope,
  createVaultEnvelope,
  decryptVaultPayload,
  encryptVaultPayload,
  ensureSharingKey,
  promoteToDocumentKey,
  unwrapOwnerDocumentKey,
  unwrapRecipientDocumentKey,
  unlockVault,
  unlockVaultWithRecovery,
} from "./lib/crypto";
import type { VaultEnvelope } from "./lib/crypto";
import "./App.css";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3000/api";

const passwordCharacterSets = [
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnopqrstuvwxyz",
  "23456789",
  "!@#$%*+-_=?.",
];
const phrasePrefixes = [
  "agil",
  "alto",
  "ambar",
  "azul",
  "bravo",
  "claro",
  "dulce",
  "firme",
  "fresco",
  "gran",
  "libre",
  "ligero",
  "limpio",
  "lunar",
  "noble",
  "nuevo",
  "pleno",
  "pronto",
  "puro",
  "rapido",
  "real",
  "sabio",
  "sereno",
  "solar",
  "suave",
  "tenaz",
  "tibio",
  "vasto",
  "verde",
  "vivo",
  "zafiro",
  "zen",
];
const phraseSuffixes = [
  "arco",
  "astro",
  "bosque",
  "brisa",
  "cauce",
  "cedro",
  "cielo",
  "costa",
  "delta",
  "faro",
  "flor",
  "fuego",
  "isla",
  "lago",
  "loma",
  "luna",
  "mar",
  "monte",
  "nube",
  "oasis",
  "olmo",
  "onda",
  "pino",
  "rio",
  "roca",
  "selva",
  "senda",
  "sol",
  "sur",
  "tierra",
  "valle",
  "viento",
];

function secureRandomIndex(limit: number) {
  const maximum = Math.floor(0x100000000 / limit) * limit;
  const random = new Uint32Array(1);
  do crypto.getRandomValues(random);
  while (random[0] >= maximum);
  return random[0] % limit;
}

function shuffleSecurely(characters: string[]) {
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const target = secureRandomIndex(index + 1);
    [characters[index], characters[target]] = [
      characters[target],
      characters[index],
    ];
  }
  return characters;
}

function estimatePasswordStrength(value: string) {
  if (!value) return { score: 0, label: "Sin contraseña", tone: "empty" };
  let poolSize = 0;
  if (/[a-z]/.test(value)) poolSize += 26;
  if (/[A-Z]/.test(value)) poolSize += 26;
  if (/\d/.test(value)) poolSize += 10;
  if (/[^A-Za-z0-9]/.test(value)) poolSize += 28;
  const entropy =
    value.includes("-") && value.split("-").length >= 4
      ? value.split("-").length *
        Math.log2(phrasePrefixes.length * phraseSuffixes.length)
      : value.length * Math.log2(Math.max(poolSize, 1));
  if (entropy < 35) return { score: 25, label: "Débil", tone: "weak" };
  if (entropy < 50) return { score: 50, label: "Aceptable", tone: "fair" };
  if (entropy < 80) return { score: 75, label: "Fuerte", tone: "strong" };
  return { score: 100, label: "Excelente", tone: "excellent" };
}

type MenuItem = {
  id: string;
  key: string;
  label: string;
  path: string | null;
  icon: string | null;
  type: "PAGE" | "GROUP" | "EXTERNAL_LINK";
  children: MenuItem[];
};
type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions?: string[];
};
type Vault = VaultEnvelope & {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};
type VaultItem = {
  id: string;
  type: "LOGIN" | "SECURE_NOTE" | "CARD" | "IDENTITY";
  encryptedData: string;
  nonce: string;
  version: number;
  encryptionScheme: "VAULT_KEY" | "DOCUMENT_KEY";
  encryptedDocumentKey: string | null;
  documentKeyNonce: string | null;
  createdAt: string;
  updatedAt: string;
};
type VaultItemType = VaultItem["type"];
type CustomField = { name: string; value: string; protected: boolean };
type VaultItemValue = {
  title: string;
  folder?: string;
  tags?: string[];
  favorite?: boolean;
  archived?: boolean;
  username?: string;
  password?: string;
  website?: string;
  notes?: string;
  cardholder?: string;
  cardNumber?: string;
  expiry?: string;
  securityCode?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  customFields?: CustomField[];
};
type DecryptedVaultItem = {
  id: string;
  type: VaultItemType;
  value: VaultItemValue;
  version: number;
  encryptionScheme: VaultItem["encryptionScheme"];
  encryptedDocumentKey: string | null;
  documentKeyNonce: string | null;
};
type VaultItemRevision = {
  id: string;
  version: number;
  encryptedData: string;
  nonce: string;
  encryptionScheme: VaultItem["encryptionScheme"];
  createdAt: string;
};
type DecryptedVaultItemRevision = {
  id: string;
  version: number;
  createdAt: string;
  value: VaultItemValue;
};
type VaultItemImport = Pick<VaultItem, "type" | "encryptedData" | "nonce">;
type VaultExport = { version: 1; exportedAt: string; items: VaultItemImport[] };
type SharedVaultItem = {
  id: string;
  vaultItemId: string;
  permission: "read" | "write";
  senderPublicKey: JsonWebKey;
  encryptedItemKey: string;
  itemKeyNonce: string;
  vaultItem: {
    type: VaultItemType;
    encryptedData: string;
    nonce: string;
    version: number;
    encryptionScheme: "DOCUMENT_KEY";
  };
};
type DecryptedSharedVaultItem = {
  id: string;
  vaultItemId: string;
  permission: "read" | "write";
  type: VaultItemType;
  version: number;
  value: VaultItemValue;
  documentKey: CryptoKey;
};
type Session = {
  user: AuthenticatedUser;
  menu: MenuItem[];
  accessToken: string;
  vaults: Vault[];
};
type AuthResponse = { user: AuthenticatedUser; accessToken: string };
type MfaChallenge = { requiresMfa: true; challengeToken: string };
type PasswordChangeChallenge = {
  requiresPasswordChange: true;
  changeToken: string;
};
type AuthView = "login" | "forgot" | "reset";
type OrganizationMember = {
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: string;
  user: { id: string; email: string; displayName: string };
};
type Organization = {
  id: string;
  name: string;
  ownerId: string;
  members: OrganizationMember[];
  teams: {
    id: string;
    name: string;
    members: {
      membership: { user: { id: string; email: string; displayName: string } };
    }[];
  }[];
};
type TeamShareOption = { id: string; name: string; organizationName: string };
type TeamShareRecipient = {
  id: string;
  email: string;
  displayName: string;
  publicKey: JsonWebKey;
};
type ItemShareOverview = {
  directShares: {
    id: string;
    permission: "read" | "write";
    expiresAt: string | null;
    revokedAt: string | null;
    createdAt: string;
    recipient: { id: string; email: string; displayName: string };
  }[];
  teamShares: {
    id: string;
    permission: "read" | "write";
    expiresAt: string | null;
    revokedAt: string | null;
    createdAt: string;
    team: { id: string; name: string };
    _count: { shares: number };
  }[];
};
type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";
  emailVerifiedAt: string | null;
  createdAt: string;
  roles: { role: { code: string; name: string } }[];
};
type AdminRoleOption = {
  code: string;
  name: string;
  description: string | null;
};
type AdminRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  permissions: { permission: { code: string; name: string } }[];
  _count: { users: number };
};
type CreateRoleInput = {
  code: string;
  name: string;
  description: string;
  permissionCodes: string[];
};
type AdminPermission = {
  code: string;
  name: string;
  description: string | null;
};
type AdminMenuItem = {
  id: string;
  key: string;
  label: string;
  path: string | null;
  icon: string | null;
  type: "PAGE" | "GROUP" | "EXTERNAL_LINK";
  sortOrder: number;
  isVisible: boolean;
  parentId: string | null;
  permission: { code: string; name: string } | null;
};
export type MenuItemInput = {
  key: string;
  label: string;
  path: string | null;
  icon: string | null;
  type: AdminMenuItem["type"];
  sortOrder: number;
  isVisible: boolean;
  parentId: string | null;
  permissionCode: string | null;
};
type AuditEvent = {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { email: string; displayName: string } | null;
};

let restoreRequest: Promise<AuthResponse | null> | null = null;

function getAuthView(): AuthView {
  if (window.location.hash.startsWith("#reset")) return "reset";
  if (window.location.hash === "#recuperar") return "forgot";
  return "login";
}

function getResetToken() {
  const queryStart = window.location.hash.indexOf("?");
  return queryStart >= 0
    ? (new URLSearchParams(window.location.hash.slice(queryStart + 1)).get(
        "token",
      ) ?? "")
    : "";
}

async function getApiMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  if (Array.isArray(payload?.message)) return payload.message[0] ?? fallback;
  return payload?.message ?? fallback;
}

async function restoreAuthentication() {
  if (!restoreRequest) {
    restoreRequest = fetch(`${apiUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (response) =>
        response.ok ? (response.json() as Promise<AuthResponse>) : null,
      )
      .finally(() => {
        restoreRequest = null;
      });
  }
  return restoreRequest;
}

async function loadSession(authResponse: AuthResponse): Promise<Session> {
  const headers = { Authorization: `Bearer ${authResponse.accessToken}` };
  const [menuResponse, vaultResponse] = await Promise.all([
    fetch(`${apiUrl}/navigation/menu`, { headers }),
    fetch(`${apiUrl}/vaults`, { headers }),
  ]);
  if (!menuResponse.ok || !vaultResponse.ok) {
    throw new Error("No fue posible recuperar tu espacio seguro.");
  }
  return {
    user: authResponse.user,
    accessToken: authResponse.accessToken,
    menu: await menuResponse.json(),
    vaults: await vaultResponse.json(),
  };
}

const menuIcons = {
  Building2,
  KeyRound,
  PanelLeft,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
};

const theme = createTheme({
  palette: {
    primary: { main: "#0b6e62", dark: "#07554b" },
    background: { default: "#f3f7f5", paper: "#ffffff" },
    text: { primary: "#172522", secondary: "#5b6965" },
  },
  shape: { borderRadius: 8 },
  typography: { fontFamily: '"DM Sans", sans-serif' },
});

function App() {
  const [authView, setAuthView] = useState<AuthView>(getAuthView);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
  const [passwordChangeChallenge, setPasswordChangeChallenge] =
    useState<PasswordChangeChallenge | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    void restoreAuthentication()
      .then((authResponse) => (authResponse ? loadSession(authResponse) : null))
      .then((restoredSession) => {
        if (!cancelled && restoredSession) setSession(restoredSession);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsRestoringSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const updateAuthView = () => setAuthView(getAuthView());
    window.addEventListener("hashchange", updateAuthView);
    return () => window.removeEventListener("hashchange", updateAuthView);
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);
    try {
      const loginResponse = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const loginPayload = await loginResponse.json();
      if (!loginResponse.ok) {
        throw new Error(
          Array.isArray(loginPayload.message)
            ? loginPayload.message[0]
            : (loginPayload.message ?? "No fue posible iniciar sesión."),
        );
      }
      if (
        loginPayload.requiresMfa &&
        typeof loginPayload.challengeToken === "string"
      ) {
        setMfaChallenge(loginPayload as MfaChallenge);
        setMfaCode("");
        setPassword("");
        return;
      }
      if (
        loginPayload.requiresPasswordChange &&
        typeof loginPayload.changeToken === "string"
      ) {
        setPasswordChangeChallenge(loginPayload as PasswordChangeChallenge);
        setPassword("");
        return;
      }
      setSession(await loadSession(loginPayload as AuthResponse));
      setPassword("");
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "No fue posible iniciar sesión.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMfaLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfaChallenge) return;
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/auth/mfa/login/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeToken: mfaChallenge.challengeToken,
          code: mfaCode,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          Array.isArray(payload.message)
            ? payload.message[0]
            : (payload.message ?? "No fue posible verificar el código."),
        );
        if (
          payload.requiresPasswordChange &&
          typeof payload.changeToken === "string"
        ) {
          setPasswordChangeChallenge(payload as PasswordChangeChallenge);
          setMfaChallenge(null);
          setMfaCode("");
          return;
        }
      setSession(await loadSession(payload as AuthResponse));
      setMfaChallenge(null);
      setMfaCode("");
    } catch (mfaError) {
      setError(
        mfaError instanceof Error
          ? mfaError.message
          : "No fue posible verificar el código.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch(`${apiUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setSession(null);
    }
  }

  async function refreshNavigation() {
    if (!session) return;
    const response = await fetch(`${apiUrl}/navigation/menu`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (!response.ok) return;
    const menu = (await response.json()) as MenuItem[];
    setSession((current) => (current ? { ...current, menu } : current));
  }

  if (isRestoringSession) {
    return (
      <ThemeProvider theme={theme}>
        <main className="session-loading">
          <span className="brand-mark">
            <KeyRound size={22} />
          </span>
          <p>Recuperando tu espacio seguro...</p>
        </main>
      </ThemeProvider>
    );
  }

  if (session && authView === "login") {
    return (
      <ThemeProvider theme={theme}>
        <Dashboard
          user={session.user}
          menu={session.menu}
          accessToken={session.accessToken}
          vaults={session.vaults}
          onLogout={() => void handleLogout()}
          onNavigationChanged={refreshNavigation}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <main className="login-page min-h-screen">
        <aside className="security-panel" aria-label="Seguridad de PassNexus">
          <header className="brand">
            <span className="brand-mark" aria-hidden="true">
              <KeyRound size={24} strokeWidth={2.5} />
            </span>
            <span>PassNexus</span>
          </header>
          <div className="security-content">
            <div className="eyebrow">
              <ShieldCheck size={16} /> ADMINISTRADOR DE SECRETOS
            </div>
            <h1>La calma de saber que todo esta protegido.</h1>
            <p>
              Centraliza el acceso de tu equipo sin entregar el control de sus
              secretos.
            </p>
          </div>
          <div className="security-status">
            <span className="status-dot" />
            <span>Cifrado de extremo a extremo</span>
          </div>
        </aside>

        <section className="login-shell">
          <div className="mobile-brand brand">
            <span className="brand-mark" aria-hidden="true">
              <KeyRound size={21} strokeWidth={2.5} />
            </span>
            <span>PassNexus</span>
          </div>
          <div className="login-card">
            {authView === "forgot" && <ForgotPasswordForm />}
            {authView === "reset" && <ResetPasswordForm />}
            {authView === "login" && passwordChangeChallenge && (
              <TemporaryPasswordChangeForm
                challenge={passwordChangeChallenge}
                onComplete={(message) => {
                  setPasswordChangeChallenge(null);
                  setNotice(message);
                }}
              />
            )}
            {authView === "login" &&
              !passwordChangeChallenge &&
              mfaChallenge && (
              <>
                <a
                  className="auth-back"
                  href="#"
                  onClick={() => {
                    setMfaChallenge(null);
                    setMfaCode("");
                    setError("");
                  }}
                >
                  <ArrowLeft size={16} /> Usar otra cuenta
                </a>
                <div className="login-heading">
                  <span className="lock-badge" aria-hidden="true">
                    <ShieldCheck size={20} />
                  </span>
                  <h2>Verifica tu identidad</h2>
                  <p>
                    Introduce el código de seis dígitos de tu aplicación
                    autenticadora.
                  </p>
                </div>
                <form className="login-form" onSubmit={handleMfaLogin}>
                  <TextField
                    label="Código de autenticación"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    fullWidth
                    value={mfaCode}
                    onChange={(event) =>
                      setMfaCode(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    required
                  />
                  {error && <Alert severity="error">{error}</Alert>}
                  <Button
                    variant="contained"
                    size="large"
                    type="submit"
                    fullWidth
                    disabled={isSubmitting || mfaCode.length !== 6}
                  >
                    {isSubmitting
                      ? "Verificando..."
                      : "Verificar e iniciar sesión"}
                  </Button>
                </form>
              </>
            )}
            {authView === "login" &&
              !passwordChangeChallenge &&
              !mfaChallenge && (
              <>
                <div className="login-heading">
                  <span className="lock-badge" aria-hidden="true">
                    <LockKeyhole size={20} />
                  </span>
                  <h2>Bienvenido de nuevo</h2>
                  <p>Ingresa a tu espacio seguro.</p>
                </div>
                <form className="login-form" onSubmit={handleLogin}>
                  <TextField
                    label="Correo electrónico"
                    type="email"
                    autoComplete="email"
                    fullWidth
                    placeholder="tu@empresa.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                  <TextField
                    label="Contraseña"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    fullWidth
                    placeholder="Ingresa tu contraseña"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              aria-label={
                                showPassword
                                  ? "Ocultar contraseña"
                                  : "Mostrar contraseña"
                              }
                              onClick={() => setShowPassword(!showPassword)}
                              edge="end"
                            >
                              {showPassword ? (
                                <EyeOff size={19} />
                              ) : (
                                <Eye size={19} />
                              )}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                  <div className="login-options">
                    <FormControlLabel
                      control={<Checkbox size="small" />}
                      label="Recordarme"
                    />
                    <a href="#recuperar">Olvidé mi contraseña</a>
                  </div>
                  {notice && <Alert severity="success">{notice}</Alert>}
                  {error && <Alert severity="error">{error}</Alert>}
                  <Button
                    variant="contained"
                    size="large"
                    type="submit"
                    fullWidth
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Validando acceso..." : "Iniciar sesión"}
                  </Button>
                </form>
              </>
            )}
          </div>
          <footer>
            PassNexus <span>·</span> Tus secretos, bajo tu control.
          </footer>
        </section>
      </main>
    </ThemeProvider>
  );
}

function TemporaryPasswordChangeForm({
  challenge,
  onComplete,
}: {
  challenge: PasswordChangeChallenge;
  onComplete: (message: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8)
      return setError("La contraseña debe tener al menos 8 caracteres.");
    if (password !== confirmation)
      return setError("Las contraseñas no coinciden.");
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${apiUrl}/auth/change-temporary-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            changeToken: challenge.changeToken,
            password,
          }),
        },
      );
      const message = await getApiMessage(
        response,
        "No fue posible cambiar la contraseña temporal.",
      );
      if (!response.ok) throw new Error(message);
      onComplete(message);
    } catch (changeError) {
      setError(
        changeError instanceof Error
          ? changeError.message
          : "No fue posible cambiar la contraseña temporal.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="login-heading">
        <span className="lock-badge" aria-hidden="true">
          <ShieldCheck size={20} />
        </span>
        <h2>Protege tu cuenta</h2>
        <p>
          La contraseña temporal quedó expuesta. Debes reemplazarla antes de
          acceder a PassNexus.
        </p>
      </div>
      <form className="login-form" onSubmit={changePassword}>
        <TextField
          label="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          fullWidth
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          slotProps={{ htmlInput: { minLength: 8 } }}
          required
        />
        <TextField
          label="Confirmar nueva contraseña"
          type="password"
          autoComplete="new-password"
          fullWidth
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          slotProps={{ htmlInput: { minLength: 8 } }}
          required
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button
          variant="contained"
          size="large"
          type="submit"
          fullWidth
          disabled={isSubmitting}
        >
          {isSubmitting ? "Guardando contraseña..." : "Guardar nueva contraseña"}
        </Button>
      </form>
    </>
  );
}

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const responseMessage = await getApiMessage(
        response,
        "No fue posible solicitar el restablecimiento.",
      );
      if (!response.ok) throw new Error(responseMessage);
      setMessage(responseMessage);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible solicitar el restablecimiento.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <a className="auth-back" href="#">
        <ArrowLeft size={16} /> Volver al inicio de sesión
      </a>
      <div className="login-heading">
        <span className="lock-badge" aria-hidden="true">
          <KeyRound size={20} />
        </span>
        <h2>Recupera tu acceso</h2>
        <p>Te enviaremos un enlace para restablecer tu contraseña.</p>
      </div>
      <form className="login-form" onSubmit={requestReset}>
        <TextField
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          fullWidth
          placeholder="tu@empresa.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        {error && <Alert severity="error">{error}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        <Button
          variant="contained"
          size="large"
          type="submit"
          fullWidth
          disabled={isSubmitting}
        >
          {isSubmitting
            ? "Enviando enlace..."
            : "Enviar enlace de recuperación"}
        </Button>
      </form>
    </>
  );
}

function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const token = getResetToken();

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token)
      return setError(
        "El enlace de restablecimiento no incluye un token válido.",
      );
    if (password.length < 8)
      return setError("La contraseña debe tener al menos 8 caracteres.");
    if (password !== confirmation)
      return setError("Las contraseñas no coinciden.");
    setError("");
    setMessage("");
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const responseMessage = await getApiMessage(
        response,
        "No fue posible restablecer la contraseña.",
      );
      if (!response.ok) throw new Error(responseMessage);
      setMessage(responseMessage);
      setPassword("");
      setConfirmation("");
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "No fue posible restablecer la contraseña.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <a className="auth-back" href="#">
        <ArrowLeft size={16} /> Volver al inicio de sesión
      </a>
      <div className="login-heading">
        <span className="lock-badge" aria-hidden="true">
          <LockKeyhole size={20} />
        </span>
        <h2>Crea una nueva contraseña</h2>
        <p>Elige una contraseña nueva de al menos 8 caracteres.</p>
      </div>
      <form className="login-form" onSubmit={resetPassword}>
        <TextField
          label="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          fullWidth
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          slotProps={{ htmlInput: { minLength: 8 } }}
          required
        />
        <TextField
          label="Confirmar nueva contraseña"
          type="password"
          autoComplete="new-password"
          fullWidth
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          slotProps={{ htmlInput: { minLength: 8 } }}
          required
        />
        {error && <Alert severity="error">{error}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        <Button
          variant="contained"
          size="large"
          type="submit"
          fullWidth
          disabled={isSubmitting || !token}
        >
          {isSubmitting
            ? "Restableciendo contraseña..."
            : "Restablecer contraseña"}
        </Button>
      </form>
    </>
  );
}

function Dashboard({
  user,
  menu,
  accessToken,
  vaults: initialVaults,
  onLogout,
  onNavigationChanged,
}: {
  user: AuthenticatedUser;
  menu: MenuItem[];
  accessToken: string;
  vaults: Vault[];
  onLogout: () => void;
  onNavigationChanged: () => Promise<void>;
}) {
  const permissions = user.permissions ?? [];
  const mobileMenu = menu
    .flatMap((item) => (item.type === "GROUP" ? item.children : [item]))
    .slice(0, 4);
  const [vaults, setVaults] = useState(initialVaults);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [activeVault, setActiveVault] = useState<Vault | null>(
    initialVaults[0] ?? null,
  );
  const [activeSection, setActiveSection] = useState("vault");
  const [mfaSettingsOpen, setMfaSettingsOpen] = useState(false);
  const activeMenuItem = menu
    .flatMap((item) => (item.type === "GROUP" ? item.children : [item]))
    .find((item) => item.key === activeSection);

  const ready = (vault: Vault, key: CryptoKey) => {
    setVaults((existingVaults) =>
      existingVaults.some((existingVault) => existingVault.id === vault.id)
        ? existingVaults
        : [...existingVaults, vault],
    );
    setActiveVault(vault);
    setVaultKey(key);
  };

  return (
    <main className="dashboard-page">
      <aside className="dashboard-sidebar">
        <header className="brand">
          <span className="brand-mark">
            <KeyRound size={21} />
          </span>
          <span>PassNexus</span>
        </header>
        <nav aria-label="Navegación principal" className="menu-list">
          {menu.map((item) => (
            <MenuEntry
              key={item.id}
              item={item}
              activeSection={activeSection}
              onSelect={setActiveSection}
            />
          ))}
        </nav>
        <div className="profile-block">
          <span className="profile-initial">
            {user.displayName.charAt(0).toUpperCase()}
          </span>
          <div>
            <strong>{user.displayName}</strong>
            <span>
              {user.roles.includes("ADMINISTRATOR")
                ? "Administrador"
                : "Miembro"}
            </span>
          </div>
          <IconButton
            aria-label="Configurar autenticación multifactor"
            onClick={() => setMfaSettingsOpen(true)}
          >
            <ShieldCheck size={18} />
          </IconButton>
          <IconButton aria-label="Cerrar sesión" onClick={onLogout}>
            <LogOut size={18} />
          </IconButton>
        </div>
      </aside>
      <section className="dashboard-content">
        <header className="content-header">
          <div>
            <p className="section-label">
              {activeSection === "vault" ? "ESPACIO SEGURO" : "ADMINISTRACIÓN"}
            </p>
            <h1>
              {activeSection === "vault"
                ? (activeVault?.name ?? "Mi vault")
                : (activeMenuItem?.label ?? "Administración")}
            </h1>
          </div>
        </header>
        {activeSection === "vault" && (
          <>
            {vaults.length === 0 && (
              <VaultSetup
                accessToken={accessToken}
                canCreate={permissions.includes("vault.create")}
                onReady={ready}
              />
            )}
            {activeVault && !vaultKey && (
              <VaultUnlock
                accessToken={accessToken}
                canUpdate={permissions.includes("vault.update")}
                vault={activeVault}
                onReady={ready}
              />
            )}
            {activeVault && vaultKey && (
              <VaultContents
                accessToken={accessToken}
                userId={user.id}
                vault={activeVault}
                vaultKey={vaultKey}
                permissions={permissions}
              />
            )}
          </>
        )}
        {activeSection === "organizations" && (
          <OrganizationsManagement
            accessToken={accessToken}
            userId={user.id}
            permissions={permissions}
          />
        )}
        {activeSection !== "vault" && activeSection !== "organizations" && (
          <AdminPanel
            accessToken={accessToken}
            section={activeSection}
            permissions={permissions}
            onNavigationChanged={onNavigationChanged}
          />
        )}
      </section>
      <nav className="mobile-menu" aria-label="Navegación móvil">
        {mobileMenu.map((item) => {
          const Icon = item.icon
            ? (menuIcons[item.icon as keyof typeof menuIcons] ?? PanelLeft)
            : PanelLeft;
          return (
            <a
              key={item.id}
              href={item.path ?? "#"}
              target={item.type === "EXTERNAL_LINK" ? "_blank" : undefined}
              rel={item.type === "EXTERNAL_LINK" ? "noreferrer" : undefined}
              onClick={(event) => {
                if (item.type === "EXTERNAL_LINK") return;
                event.preventDefault();
                setActiveSection(item.key);
              }}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
      <MfaSettingsDialog
        open={mfaSettingsOpen}
        accessToken={accessToken}
        onClose={() => setMfaSettingsOpen(false)}
        onDisabled={onLogout}
      />
    </main>
  );
}

function MfaSettingsDialog({
  open,
  accessToken,
  onClose,
  onDisabled,
}: {
  open: boolean;
  accessToken: string;
  onClose: () => void;
  onDisabled: () => void;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [manualEntryKey, setManualEntryKey] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setError("");
      setMessage("");
      setCode("");
      setManualEntryKey("");
      setQrCode("");
      void fetch(`${apiUrl}/auth/mfa/status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then(async (response) =>
          response.ok
            ? (response.json() as Promise<{ enabled: boolean }>)
            : Promise.reject(
                new Error(
                  await getApiMessage(
                    response,
                    "No fue posible consultar MFA.",
                  ),
                ),
              ),
        )
        .then((status) => setEnabled(status.enabled))
        .catch((statusError) =>
          setError(
            statusError instanceof Error
              ? statusError.message
              : "No fue posible consultar MFA.",
          ),
        );
    });
  }, [open, accessToken]);

  async function startSetup() {
    setError("");
    setMessage("");
    setIsBusy(true);
    try {
      const response = await fetch(`${apiUrl}/auth/mfa/setup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          Array.isArray(payload.message)
            ? payload.message[0]
            : (payload.message ?? "No fue posible preparar MFA."),
        );
      setManualEntryKey(payload.manualEntryKey);
      setQrCode(
        await QRCode.toDataURL(payload.otpauthUri, { margin: 1, width: 220 }),
      );
    } catch (setupError) {
      setError(
        setupError instanceof Error
          ? setupError.message
          : "No fue posible preparar MFA.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function verifySetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsBusy(true);
    try {
      const response = await fetch(`${apiUrl}/auth/mfa/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          Array.isArray(payload.message)
            ? payload.message[0]
            : (payload.message ?? "No fue posible activar MFA."),
        );
      setEnabled(true);
      setManualEntryKey("");
      setQrCode("");
      setCode("");
      setMessage("La autenticación multifactor está activa.");
    } catch (verificationError) {
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : "No fue posible activar MFA.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function disableMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsBusy(true);
    try {
      const response = await fetch(`${apiUrl}/auth/mfa/disable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          Array.isArray(payload.message)
            ? payload.message[0]
            : (payload.message ?? "No fue posible desactivar MFA."),
        );
      onDisabled();
    } catch (disableError) {
      setError(
        disableError instanceof Error
          ? disableError.message
          : "No fue posible desactivar MFA.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  const codeField = (
    <TextField
      label="Código de autenticación"
      autoComplete="one-time-code"
      inputMode="numeric"
      fullWidth
      value={code}
      onChange={(event) =>
        setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
      }
      required
    />
  );
  return (
    <Dialog
      open={open}
      onClose={isBusy ? undefined : onClose}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>Autenticación multifactor</DialogTitle>
      <DialogContent className="mfa-dialog-content">
        {error && <Alert severity="error">{error}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        {enabled === null && !error && <p>Comprobando la configuración...</p>}
        {enabled === false && !manualEntryKey && (
          <>
            <p>
              Protege tu cuenta con códigos temporales generados por una
              aplicación autenticadora.
            </p>
            <Button
              variant="contained"
              onClick={() => void startSetup()}
              disabled={isBusy}
            >
              {isBusy ? "Preparando..." : "Configurar aplicación autenticadora"}
            </Button>
          </>
        )}
        {enabled === false && manualEntryKey && (
          <form className="mfa-setup-form" onSubmit={verifySetup}>
            <p>
              Escanea este código QR con tu aplicación autenticadora y confirma
              el primer código generado.
            </p>
            {qrCode && (
              <img
                className="mfa-qr-code"
                src={qrCode}
                alt="Código QR para configurar PassNexus en una aplicación autenticadora"
              />
            )}
            <TextField
              label="Clave manual"
              fullWidth
              value={manualEntryKey}
              slotProps={{ input: { readOnly: true } }}
              helperText="Úsala solo si no puedes escanear el QR."
            />
            {codeField}
            <Button
              variant="contained"
              type="submit"
              disabled={isBusy || code.length !== 6}
            >
              {isBusy ? "Verificando..." : "Activar MFA"}
            </Button>
          </form>
        )}
        {enabled === true && (
          <form className="mfa-setup-form" onSubmit={disableMfa}>
            <p>
              MFA está activa. Para desactivarla, confirma un código de tu
              aplicación autenticadora. Todas las sesiones se cerrarán.
            </p>
            {codeField}
            <Button
              color="error"
              variant="contained"
              type="submit"
              disabled={isBusy || code.length !== 6}
            >
              {isBusy ? "Desactivando..." : "Desactivar MFA"}
            </Button>
          </form>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isBusy}>
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function VaultSetup({
  accessToken,
  canCreate,
  onReady,
}: {
  accessToken: string;
  canCreate: boolean;
  onReady: (vault: Vault, key: CryptoKey) => void;
}) {
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [pendingVault, setPendingVault] = useState<{
    vault: Vault;
    vaultKey: CryptoKey;
    recoveryKey: string;
  } | null>(null);

  async function createVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (masterPassword.length < 8)
      return setError(
        "La contraseña maestra debe tener al menos 8 caracteres.",
      );
    if (masterPassword !== confirmation)
      return setError("Las contraseñas maestras no coinciden.");
    setError("");
    setIsCreating(true);
    try {
      const { envelope, vaultKey, recoveryKey } = await createVaultEnvelope(masterPassword);
      const response = await fetch(`${apiUrl}/vaults`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name: "Mi vault", ...envelope }),
      });
      const vault = await response.json();
      if (!response.ok)
        throw new Error(vault.message ?? "No fue posible crear el vault.");
      setPendingVault({ vault, vaultKey, recoveryKey });
    } catch (vaultError) {
      setError(
        vaultError instanceof Error
          ? vaultError.message
          : "No fue posible crear el vault.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  if (!canCreate)
    return (
      <section className="vault-empty vault-setup">
        <span className="read-only-badge">Acceso de consulta</span>
        <span className="empty-icon">
          <LockKeyhole size={25} />
        </span>
        <h2>No hay un vault disponible.</h2>
        <p>Tu rol permite consultar vaults existentes, pero no crear uno.</p>
      </section>
    );

  if (pendingVault)
    return (
      <section className="vault-empty vault-setup recovery-key-screen">
        <span className="empty-icon"><KeyRound size={25} /></span>
        <h2>Guarda tu clave de recuperación.</h2>
        <p>
          Esta clave permite crear una nueva contraseña maestra. No podremos
          mostrarla otra vez ni recuperarla por ti.
        </p>
        <TextField value={pendingVault.recoveryKey} fullWidth slotProps={{ input: { readOnly: true } }} />
        <Button
          variant="contained"
          onClick={() => {
            onReady(pendingVault.vault, pendingVault.vaultKey);
            void ensureSharingKey(pendingVault.vaultKey, accessToken, apiUrl).catch(() => undefined);
          }}
        >
          Ya la guardé, abrir mi vault
        </Button>
      </section>
    );

  return (
    <section className="vault-empty vault-setup">
      <span className="empty-icon">
        <LockKeyhole size={25} />
      </span>
      <h2>Crea tu contraseña maestra.</h2>
      <p>
        Solo se usa en este dispositivo para cifrar tu vault. PassNexus no la
        guarda ni puede recuperarla.
      </p>
      <form onSubmit={createVault}>
        <TextField
          label="Contraseña maestra"
          type="password"
          value={masterPassword}
          onChange={(event) => setMasterPassword(event.target.value)}
          fullWidth
          required
        />
        <TextField
          label="Confirmar contraseña maestra"
          type="password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          fullWidth
          required
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button variant="contained" type="submit" disabled={isCreating}>
          {isCreating ? "Protegiendo vault..." : "Crear vault protegido"}
        </Button>
      </form>
    </section>
  );
}

function VaultUnlock({
  accessToken,
  canUpdate,
  vault,
  onReady,
}: {
  accessToken: string;
  canUpdate: boolean;
  vault: Vault;
  onReady: (vault: Vault, key: CryptoKey) => void;
}) {
  const [masterPassword, setMasterPassword] = useState("");
  const [error, setError] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockMode, setUnlockMode] = useState<"password" | "recovery">("password");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newMasterPassword, setNewMasterPassword] = useState("");
  const [newMasterConfirmation, setNewMasterConfirmation] = useState("");
  const [pendingRecovery, setPendingRecovery] = useState<{
    vault: Vault;
    vaultKey: CryptoKey;
    recoveryKey: string;
  } | null>(null);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsUnlocking(true);
    let vaultKey: CryptoKey;
    try {
      vaultKey = await unlockVault(masterPassword, vault);
    } catch {
      setError(
        "No fue posible desbloquear el vault. Verifica tu contraseña maestra.",
      );
      setIsUnlocking(false);
      return;
    }

    if (
      canUpdate &&
      (!vault.encryptedRecoveryVaultKey || !vault.recoveryVaultKeyNonce)
    ) {
      try {
        const recoveryEnvelope = await createRecoveryVaultEnvelope(vaultKey);
        const { recoveryKey, ...recoveryEnvelopePayload } = recoveryEnvelope;
        const response = await fetch(
          `${apiUrl}/vaults/${vault.id}/recovery-envelope`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(recoveryEnvelopePayload),
          },
        );
        const updatedVault = await response.json();
        if (!response.ok)
          throw new Error(
            updatedVault.message ??
              "No fue posible configurar la clave de recuperación.",
          );
        setPendingRecovery({
          vault: updatedVault,
          vaultKey,
          recoveryKey,
        });
      } catch {
        onReady(vault, vaultKey);
        void ensureSharingKey(vaultKey, accessToken, apiUrl).catch(
          () => undefined,
        );
      } finally {
        setIsUnlocking(false);
      }
      return;
    }

    onReady(vault, vaultKey);
    if (canUpdate)
      void ensureSharingKey(vaultKey, accessToken, apiUrl).catch(
        () => undefined,
      );
    setIsUnlocking(false);
  }

  if (pendingRecovery)
    return (
      <section className="vault-empty vault-setup recovery-key-screen">
        <span className="empty-icon">
          <KeyRound size={25} />
        </span>
        <h2>Guarda tu clave de recuperación.</h2>
        <p>
          Esta clave fue creada para tu vault existente. No podremos mostrarla
          otra vez.
        </p>
        <TextField
          value={pendingRecovery.recoveryKey}
          fullWidth
          slotProps={{ input: { readOnly: true } }}
        />
        <Button
          variant="contained"
          onClick={() => {
            onReady(pendingRecovery.vault, pendingRecovery.vaultKey);
            void ensureSharingKey(
              pendingRecovery.vaultKey,
              accessToken,
              apiUrl,
            ).catch(() => undefined);
          }}
        >
          Ya la guardé, abrir mi vault
        </Button>
      </section>
    );

  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newMasterPassword.length < 8)
      return setError("La nueva contraseña maestra debe tener al menos 8 caracteres.");
    if (newMasterPassword !== newMasterConfirmation)
      return setError("Las contraseñas maestras no coinciden.");
    setError("");
    setIsUnlocking(true);
    try {
      const vaultKey = await unlockVaultWithRecovery(recoveryKey, vault);
      const masterEnvelope = await createMasterPasswordEnvelope(newMasterPassword, vaultKey);
      const response = await fetch(`${apiUrl}/vaults/${vault.id}/key-envelope`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(masterEnvelope),
      });
      const updatedVault = await response.json();
      if (!response.ok)
        throw new Error(updatedVault.message ?? "No fue posible actualizar la contraseña maestra.");
      onReady(updatedVault, vaultKey);
      void ensureSharingKey(vaultKey, accessToken, apiUrl).catch(() => undefined);
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : "No fue posible recuperar el vault.");
    } finally {
      setIsUnlocking(false);
    }
  }

  return (
    <section className="vault-empty vault-setup">
      <span className="empty-icon">
        <LockKeyhole size={25} />
      </span>
      <h2>{unlockMode === "password" ? "Desbloquea tu vault." : "Recupera tu vault."}</h2>
      <p>{unlockMode === "password" ? "Tu contraseña maestra solo se procesa localmente." : "Usa la clave de recuperación para establecer una contraseña maestra nueva."}</p>
      <form onSubmit={unlockMode === "password" ? unlock : recover}>
        {unlockMode === "password" ? <TextField label="Contraseña maestra" type="password" value={masterPassword} onChange={(event) => setMasterPassword(event.target.value)} fullWidth required /> : <>
          <TextField label="Clave de recuperación" value={recoveryKey} onChange={(event) => setRecoveryKey(event.target.value)} fullWidth required autoComplete="off" />
          <TextField label="Nueva contraseña maestra" type="password" value={newMasterPassword} onChange={(event) => setNewMasterPassword(event.target.value)} fullWidth required />
          <TextField label="Confirmar nueva contraseña" type="password" value={newMasterConfirmation} onChange={(event) => setNewMasterConfirmation(event.target.value)} fullWidth required />
        </>}
        {error && <Alert severity="error">{error}</Alert>}
        <Button variant="contained" type="submit" disabled={isUnlocking}>
          {isUnlocking ? "Desbloqueando..." : unlockMode === "password" ? "Desbloquear vault" : "Recuperar y actualizar contraseña"}
        </Button>
        {canUpdate && (
          <Button type="button" onClick={() => { setError(""); setUnlockMode(unlockMode === "password" ? "recovery" : "password"); }} disabled={isUnlocking}>
            {unlockMode === "password" ? "Usar clave de recuperación" : "Usar contraseña maestra"}
          </Button>
        )}
      </form>
    </section>
  );
}

function VaultContents({
  accessToken,
  userId,
  vault,
  vaultKey,
  permissions,
}: {
  accessToken: string;
  userId: string;
  vault: Vault;
  vaultKey: CryptoKey;
  permissions: string[];
}) {
  const canCreate = permissions.includes("vault.create");
  const canUpdate = permissions.includes("vault.update");
  const canDelete = permissions.includes("vault.delete");
  const [items, setItems] = useState<DecryptedVaultItem[]>([]);
  const [deletedItems, setDeletedItems] = useState<DecryptedVaultItem[]>([]);
  const [sharedItems, setSharedItems] = useState<DecryptedSharedVaultItem[]>(
    [],
  );
  const [vaultView, setVaultView] = useState<
    "all" | "favorites" | "archive" | "trash"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [itemType, setItemType] = useState<VaultItemType>("LOGIN");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemPendingDeletion, setItemPendingDeletion] = useState<{
    id: string;
    title: string;
    permanent?: boolean;
  } | null>(null);
  const [historyItemTitle, setHistoryItemTitle] = useState("");
  const [historyItemId, setHistoryItemId] = useState("");
  const [historyRevisions, setHistoryRevisions] = useState<
    DecryptedVaultItemRevision[]
  >([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isRestoringRevision, setIsRestoringRevision] = useState(false);
  const [itemToShare, setItemToShare] = useState<DecryptedVaultItem | null>(
    null,
  );
  const [shareRecipientEmail, setShareRecipientEmail] = useState("");
  const [shareMode, setShareMode] = useState<"individual" | "team">(
    "individual",
  );
  const [shareTeamId, setShareTeamId] = useState("");
  const [shareTeams, setShareTeams] = useState<TeamShareOption[]>([]);
  const [sharePermission, setSharePermission] = useState<"read" | "write">(
    "read",
  );
  const [shareExpiresAt, setShareExpiresAt] = useState("");
  const [itemShareOverview, setItemShareOverview] =
    useState<ItemShareOverview | null>(null);
  const [isLoadingShareOverview, setIsLoadingShareOverview] = useState(false);
  const [isRevokingShare, setIsRevokingShare] = useState(false);
  const [sharedItemToEdit, setSharedItemToEdit] =
    useState<DecryptedSharedVaultItem | null>(null);
  const [sharedItemToView, setSharedItemToView] =
    useState<DecryptedSharedVaultItem | null>(null);
  const [isSharedItemRevealed, setIsSharedItemRevealed] = useState(false);
  const [sharedItemTitle, setSharedItemTitle] = useState("");
  const [sharedItemNotes, setSharedItemNotes] = useState("");
  const [isSavingSharedItem, setIsSavingSharedItem] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [cardholder, setCardholder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [securityCode, setSecurityCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [identityEmail, setIdentityEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [folder, setFolder] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [generatorMode, setGeneratorMode] = useState<"password" | "passphrase">(
    "password",
  );
  const [passwordLength, setPasswordLength] = useState(20);
  const [phraseWordCount, setPhraseWordCount] = useState(5);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [revealedItemIds, setRevealedItemIds] = useState<string[]>([]);
  const [copiedField, setCopiedField] = useState("");
  const [error, setError] = useState("");

  async function copyCredentialField(
    itemId: string,
    field: string,
    value: string,
  ) {
    await navigator.clipboard.writeText(value);
    setCopiedField(`${itemId}-${field}`);
    window.setTimeout(() => setCopiedField(""), 1800);
  }

  function closeCredentialDialog() {
    setItemType("LOGIN");
    setTitle("");
    setUsername("");
    setPassword("");
    setWebsite("");
    setNotes("");
    setCardholder("");
    setCardNumber("");
    setExpiry("");
    setSecurityCode("");
    setFullName("");
    setIdentityEmail("");
    setPhone("");
    setAddress("");
    setCustomFields([]);
    setFolder("");
    setTagsInput("");
    setShowNewPassword(false);
    setEditingItemId(null);
    setIsAdding(false);
  }

  function openNewCredential() {
    closeCredentialDialog();
    setIsAdding(true);
  }

  function openEditCredential(item: DecryptedVaultItem) {
    setItemType(item.type);
    setEditingItemId(item.id);
    setTitle(item.value.title);
    setUsername(item.value.username ?? "");
    setPassword(item.value.password ?? "");
    setWebsite(item.value.website ?? "");
    setNotes(item.value.notes ?? "");
    setCardholder(item.value.cardholder ?? "");
    setCardNumber(item.value.cardNumber ?? "");
    setExpiry(item.value.expiry ?? "");
    setSecurityCode(item.value.securityCode ?? "");
    setFullName(item.value.fullName ?? "");
    setIdentityEmail(item.value.email ?? "");
    setPhone(item.value.phone ?? "");
    setAddress(item.value.address ?? "");
    setCustomFields(item.value.customFields ?? []);
    setFolder(item.value.folder ?? "");
    setTagsInput((item.value.tags ?? []).join(", "));
    setShowNewPassword(false);
    setIsAdding(true);
  }

  function generatePassword() {
    const alphabet = passwordCharacterSets.join("");
    const requiredCharacters = passwordCharacterSets.map(
      (characterSet) => characterSet[secureRandomIndex(characterSet.length)],
    );
    const remainingCharacters = Array.from(
      { length: passwordLength - requiredCharacters.length },
      () => alphabet[secureRandomIndex(alphabet.length)],
    );
    setPassword(
      shuffleSecurely([...requiredCharacters, ...remainingCharacters]).join(""),
    );
    setShowNewPassword(true);
  }

  function generatePassphrase() {
    const words = Array.from(
      { length: phraseWordCount },
      () =>
        `${phrasePrefixes[secureRandomIndex(phrasePrefixes.length)]}${phraseSuffixes[secureRandomIndex(phraseSuffixes.length)]}`,
    );
    setPassword(words.join("-"));
    setShowNewPassword(true);
  }

  function updateCustomField(index: number, patch: Partial<CustomField>) {
    setCustomFields((fields) =>
      fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    );
  }

  async function loadItems() {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [activeResponse, deletedResponse] = await Promise.all([
      fetch(`${apiUrl}/vaults/${vault.id}/items`, { headers }),
      fetch(`${apiUrl}/vaults/${vault.id}/items?status=deleted`, { headers }),
    ]);
    if (!activeResponse.ok || !deletedResponse.ok)
      throw new Error("No fue posible cargar los elementos del vault.");
    const [encryptedItems, encryptedDeletedItems]: [VaultItem[], VaultItem[]] =
      await Promise.all([activeResponse.json(), deletedResponse.json()]);
    try {
      const decryptItems = (source: VaultItem[]) =>
        Promise.all(
          source.map(async (item) => {
            const itemKey =
              item.encryptionScheme === "DOCUMENT_KEY"
                ? await unwrapOwnerDocumentKey(vaultKey, {
                    encryptedDocumentKey: item.encryptedDocumentKey!,
                    documentKeyNonce: item.documentKeyNonce!,
                  })
                : vaultKey;
            return {
              id: item.id,
              type: item.type,
              version: item.version,
              encryptionScheme: item.encryptionScheme,
              encryptedDocumentKey: item.encryptedDocumentKey,
              documentKeyNonce: item.documentKeyNonce,
              value: await decryptVaultPayload<VaultItemValue>(
                itemKey,
                item.encryptedData,
                item.nonce,
              ),
            };
          }),
        );
      const [decryptedItems, decryptedDeletedItems] = await Promise.all([
        decryptItems(encryptedItems),
        decryptItems(encryptedDeletedItems),
      ]);
      setItems(decryptedItems);
      setDeletedItems(decryptedDeletedItems);
    } catch {
      throw new Error(
        "No fue posible descifrar uno o más elementos del vault.",
      );
    }
  }

  useEffect(() => {
    void loadItems().catch((loadError) =>
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No fue posible cargar los elementos del vault.",
      ),
    );
  }, [accessToken, vault.id, vaultKey]);

  const loadSharedItems = useCallback(async () => {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [keyResponse, sharesResponse] = await Promise.all([
      fetch(`${apiUrl}/vaults/crypto-key`, { headers }),
      fetch(`${apiUrl}/vaults/shared-items`, { headers }),
    ]);
    if (!sharesResponse.ok) return;
    try {
      const shares: SharedVaultItem[] = await sharesResponse.json();
      if (shares.length === 0) {
        setSharedItems([]);
        return;
      }
      if (!keyResponse.ok || keyResponse.status === 204) return;
      const storedKey = await keyResponse.json();
      setSharedItems(
        await Promise.all(
          shares.map(async (share) => {
            const documentKey = await unwrapRecipientDocumentKey(
              vaultKey,
              storedKey,
              share,
            );
            return {
              id: share.id,
              vaultItemId: share.vaultItemId,
              permission: share.permission,
              type: share.vaultItem.type,
              version: share.vaultItem.version,
              documentKey,
              value: await decryptVaultPayload<VaultItemValue>(
                documentKey,
                share.vaultItem.encryptedData,
                share.vaultItem.nonce,
              ),
            };
          }),
        ),
      );
    } catch {
      setError("No fue posible descifrar uno o más elementos compartidos.");
    }
  }, [accessToken, vaultKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSharedItems(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSharedItems]);

  async function saveCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const existingItem = editingItemId
        ? items.find((item) => item.id === editingItemId)
        : undefined;
      const common = {
        title,
        folder: folder.trim() || undefined,
        tags: tagsInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        favorite: existingItem?.value.favorite ?? false,
        archived: existingItem?.value.archived ?? false,
        notes: notes.trim() || undefined,
        customFields: customFields
          .filter((field) => field.name.trim() && field.value)
          .map((field) => ({ ...field, name: field.name.trim() })),
      };
      const value: VaultItemValue =
        itemType === "LOGIN"
          ? {
              ...common,
              username,
              password,
              website: website.trim() || undefined,
            }
          : itemType === "CARD"
            ? { ...common, cardholder, cardNumber, expiry, securityCode }
            : itemType === "IDENTITY"
              ? {
                  ...common,
                  fullName,
                  email: identityEmail.trim() || undefined,
                  phone: phone.trim() || undefined,
                  address: address.trim() || undefined,
                }
              : common;
      const encryptionKey =
        existingItem?.encryptionScheme === "DOCUMENT_KEY"
          ? await unwrapOwnerDocumentKey(vaultKey, {
              encryptedDocumentKey: existingItem.encryptedDocumentKey!,
              documentKeyNonce: existingItem.documentKeyNonce!,
            })
          : vaultKey;
      const encrypted = await encryptVaultPayload(encryptionKey, value);
      const response = await fetch(
        `${apiUrl}/vaults/${vault.id}/items${editingItemId ? `/${editingItemId}` : ""}`,
        {
          method: editingItemId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            type: itemType,
            ...encrypted,
            ...(existingItem ? { expectedVersion: existingItem.version } : {}),
          }),
        },
      );
      const storedItem = await response.json();
      if (!response.ok)
        throw new Error(
          storedItem.message ?? "No fue posible guardar la credencial.",
        );
      setItems((existingItems) =>
        editingItemId
          ? existingItems.map((item) =>
              item.id === editingItemId
                ? {
                    ...item,
                    type: itemType,
                    version: storedItem.version,
                    value,
                  }
                : item,
            )
          : [
              {
                id: storedItem.id,
                type: itemType,
                version: storedItem.version,
                encryptionScheme: storedItem.encryptionScheme,
                encryptedDocumentKey: null,
                documentKeyNonce: null,
                value,
              },
              ...existingItems,
            ],
      );
      closeCredentialDialog();
    } catch (credentialError) {
      setError(
        credentialError instanceof Error
          ? credentialError.message
          : "No fue posible guardar la credencial.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteCredential() {
    if (!itemPendingDeletion) return;
    setError("");
    setIsDeleting(true);
    try {
      const response = await fetch(
        `${apiUrl}/vaults/${vault.id}/items/${itemPendingDeletion.id}${itemPendingDeletion.permanent ? "/permanent" : ""}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok)
        throw new Error("No fue posible eliminar la credencial.");
      if (itemPendingDeletion.permanent) {
        setDeletedItems((existingItems) =>
          existingItems.filter((item) => item.id !== itemPendingDeletion.id),
        );
      } else {
        const deletedItem = items.find(
          (item) => item.id === itemPendingDeletion.id,
        );
        setItems((existingItems) =>
          existingItems.filter((item) => item.id !== itemPendingDeletion.id),
        );
        if (deletedItem)
          setDeletedItems((existingItems) => [deletedItem, ...existingItems]);
      }
      setRevealedItemIds((ids) =>
        ids.filter((id) => id !== itemPendingDeletion.id),
      );
      setItemPendingDeletion(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No fue posible eliminar la credencial.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function updateItemOrganization(
    item: DecryptedVaultItem,
    patch: Pick<VaultItemValue, "favorite" | "archived">,
  ) {
    setError("");
    try {
      const value = { ...item.value, ...patch };
      const encryptionKey =
        item.encryptionScheme === "DOCUMENT_KEY"
          ? await unwrapOwnerDocumentKey(vaultKey, {
              encryptedDocumentKey: item.encryptedDocumentKey!,
              documentKeyNonce: item.documentKeyNonce!,
            })
          : vaultKey;
      const encrypted = await encryptVaultPayload(encryptionKey, value);
      const response = await fetch(
        `${apiUrl}/vaults/${vault.id}/items/${item.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            type: item.type,
            ...encrypted,
            expectedVersion: item.version,
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          "No fue posible actualizar la organización del elemento.",
        );
      const storedItem = await response.json();
      setItems((existingItems) =>
        existingItems.map((existingItem) =>
          existingItem.id === item.id
            ? { ...existingItem, version: storedItem.version, value }
            : existingItem,
        ),
      );
    } catch (organizationError) {
      setError(
        organizationError instanceof Error
          ? organizationError.message
          : "No fue posible actualizar la organización del elemento.",
      );
    }
  }

  async function restoreItem(item: DecryptedVaultItem) {
    setError("");
    const response = await fetch(
      `${apiUrl}/vaults/${vault.id}/items/${item.id}/restore`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) return setError("No fue posible restaurar el elemento.");
    setDeletedItems((existingItems) =>
      existingItems.filter((existingItem) => existingItem.id !== item.id),
    );
    setItems((existingItems) => [item, ...existingItems]);
  }

  async function openItemHistory(item: DecryptedVaultItem) {
    setError("");
    setHistoryItemTitle(item.value.title);
    setHistoryItemId(item.id);
    setHistoryRevisions([]);
    setIsLoadingHistory(true);
    try {
      const response = await fetch(
        `${apiUrl}/vaults/${vault.id}/items/${item.id}/history`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const revisions: VaultItemRevision[] = await response.json();
      if (!response.ok)
        throw new Error("No fue posible cargar el historial del elemento.");
      const historyKey =
        item.encryptionScheme === "DOCUMENT_KEY"
          ? await unwrapOwnerDocumentKey(vaultKey, {
              encryptedDocumentKey: item.encryptedDocumentKey!,
              documentKeyNonce: item.documentKeyNonce!,
            })
          : vaultKey;
      const compatibleRevisions = revisions.filter(
        (revision) => revision.encryptionScheme === item.encryptionScheme,
      );
      setHistoryRevisions(
        await Promise.all(
          compatibleRevisions.map(async (revision) => ({
            id: revision.id,
            version: revision.version,
            createdAt: revision.createdAt,
            value: await decryptVaultPayload<VaultItemValue>(
              historyKey,
              revision.encryptedData,
              revision.nonce,
            ),
          })),
        ),
      );
    } catch (historyError) {
      setError(
        historyError instanceof Error
          ? historyError.message
          : "No fue posible cargar el historial del elemento.",
      );
      setHistoryItemTitle("");
      setHistoryItemId("");
    } finally {
      setIsLoadingHistory(false);
    }
  }

  function isVaultItemImport(value: unknown): value is VaultItemImport {
    if (!value || typeof value !== "object") return false;
    const item = value as Record<string, unknown>;
    return (
      ["LOGIN", "SECURE_NOTE", "CARD", "IDENTITY"].includes(
        String(item.type),
      ) &&
      typeof item.encryptedData === "string" &&
      typeof item.nonce === "string"
    );
  }

  async function exportVault() {
    setError("");
    try {
      const response = await fetch(`${apiUrl}/vaults/${vault.id}/items`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const encryptedItems: VaultItem[] = await response.json();
      if (!response.ok)
        throw new Error("No fue posible exportar los elementos del vault.");
      const exportData: VaultExport = {
        version: 1,
        exportedAt: new Date().toISOString(),
        items: encryptedItems.map(({ type, encryptedData, nonce }) => ({
          type,
          encryptedData,
          nonce,
        })),
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(exportData, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${vault.name.replace(/[^a-z0-9-_]/gi, "-").toLowerCase() || "vault"}-ciphertexts.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "No fue posible exportar los elementos del vault.",
      );
    }
  }

  async function importVault(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setIsImporting(true);
    try {
      const payload: unknown = JSON.parse(await file.text());
      if (
        !payload ||
        typeof payload !== "object" ||
        !Array.isArray((payload as { items?: unknown }).items)
      )
        throw new Error(
          "El archivo debe contener un objeto JSON con una lista de elementos cifrados.",
        );
      const items = (payload as { items: unknown[] }).items;
      if (
        items.length === 0 ||
        items.length > 500 ||
        !items.every(isVaultItemImport)
      )
        throw new Error(
          "El archivo debe incluir entre 1 y 500 elementos con type, encryptedData y nonce.",
        );
      const response = await fetch(
        `${apiUrl}/vaults/${vault.id}/items/import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ items }),
        },
      );
      if (!response.ok)
        throw new Error(
          await getApiMessage(
            response,
            "No fue posible importar los elementos cifrados.",
          ),
        );
      await loadItems();
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "No fue posible importar los elementos cifrados.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  async function restoreItemRevision(revisionId: string) {
    if (!historyItemId) return;
    setError("");
    setIsRestoringRevision(true);
    try {
      const response = await fetch(
        `${apiUrl}/vaults/${vault.id}/items/${historyItemId}/history/${revisionId}/restore`,
        { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok)
        throw new Error(
          await getApiMessage(
            response,
            "No fue posible restaurar esta revisión.",
          ),
        );
      await loadItems();
      setHistoryItemTitle("");
      setHistoryItemId("");
      setHistoryRevisions([]);
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "No fue posible restaurar esta revisión.",
      );
    } finally {
      setIsRestoringRevision(false);
    }
  }

  async function openShareDialog(item: DecryptedVaultItem) {
    setItemToShare(item);
    setShareMode("individual");
    setShareRecipientEmail("");
    setShareTeamId("");
    setShareTeams([]);
    setShareExpiresAt("");
    setItemShareOverview(null);
    setIsLoadingShareOverview(true);
    void loadItemShareOverview(item.id);
    if (!canUpdate) return;
    try {
      const response = await fetch(`${apiUrl}/organizations`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return;
      const organizations: Organization[] = await response.json();
      setShareTeams(
        organizations
          .filter((organization) => organization.ownerId === userId)
          .flatMap((organization) =>
            organization.teams.map((team) => ({
              id: team.id,
              name: team.name,
              organizationName: organization.name,
            })),
          ),
      );
    } catch {
      setShareTeams([]);
    }
  }

  async function loadItemShareOverview(itemId: string) {
    setIsLoadingShareOverview(true);
    try {
      const response = await fetch(
        `${apiUrl}/vaults/${vault.id}/items/${itemId}/shares`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok)
        throw new Error(
          await getApiMessage(response, "No fue posible cargar las comparticiones."),
        );
      setItemShareOverview(await response.json());
    } catch (shareOverviewError) {
      setError(
        shareOverviewError instanceof Error
          ? shareOverviewError.message
          : "No fue posible cargar las comparticiones.",
      );
    } finally {
      setIsLoadingShareOverview(false);
    }
  }

  async function revokeShare(kind: "direct" | "team", targetId: string) {
    if (!itemToShare) return;
    setError("");
    setIsRevokingShare(true);
    try {
      const suffix =
        kind === "direct"
          ? `shares/${targetId}`
          : `team-shares/${targetId}`;
      const response = await fetch(
        `${apiUrl}/vaults/${vault.id}/items/${itemToShare.id}/${suffix}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok)
        throw new Error(
          await getApiMessage(response, "No fue posible revocar el acceso."),
        );
      await loadItemShareOverview(itemToShare.id);
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "No fue posible revocar el acceso.",
      );
    } finally {
      setIsRevokingShare(false);
    }
  }

  async function shareItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!itemToShare) return;
    setError("");
    setIsSharing(true);
    try {
      const promoted =
        itemToShare.encryptionScheme === "VAULT_KEY"
          ? await promoteToDocumentKey(vaultKey, itemToShare.value)
          : null;
      const documentKey =
        promoted?.documentKey ??
        (await unwrapOwnerDocumentKey(vaultKey, {
          encryptedDocumentKey: itemToShare.encryptedDocumentKey!,
          documentKeyNonce: itemToShare.documentKeyNonce!,
        }));
      const promotion = promoted
        ? {
            ...promoted.ownerEnvelope,
            encryptedData: promoted.encryptedData,
            nonce: promoted.nonce,
            expectedVersion: itemToShare.version,
          }
        : {};
      const response =
        shareMode === "individual"
          ? await shareWithIndividual(documentKey, promotion)
          : await shareWithTeam(documentKey, promotion);
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ?? "No fue posible compartir el elemento.",
        );
      setItemToShare(null);
      setShareRecipientEmail("");
      setSharePermission("read");
      setShareTeamId("");
      setShareExpiresAt("");
      await loadItemShareOverview(itemToShare.id);
      await loadItems();
    } catch (shareError) {
      setError(
        shareError instanceof Error
          ? shareError.message
          : "No fue posible compartir el elemento.",
      );
    } finally {
      setIsSharing(false);
    }
  }

  async function shareWithIndividual(
    documentKey: CryptoKey,
    promotion: Record<string, string | number>,
  ) {
    const keyResponse = await fetch(
      `${apiUrl}/vaults/crypto-key/${encodeURIComponent(shareRecipientEmail.trim())}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const recipient = await keyResponse.json();
    if (!keyResponse.ok)
      throw new Error(
        recipient.message ??
          "El destinatario no tiene una clave de compartición disponible.",
      );
    const recipientEnvelope = await createRecipientDocumentKeyEnvelope(
      documentKey,
      recipient.publicKey,
    );
    return fetch(`${apiUrl}/vaults/${vault.id}/items/${itemToShare!.id}/shares`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        recipientEmail: shareRecipientEmail.trim(),
        permission: sharePermission,
        ...(shareExpiresAt
          ? { expiresAt: new Date(shareExpiresAt).toISOString() }
          : {}),
        ...recipientEnvelope,
        ...promotion,
      }),
    });
  }

  async function shareWithTeam(
    documentKey: CryptoKey,
    promotion: Record<string, string | number>,
  ) {
    if (!shareTeamId) throw new Error("Selecciona un equipo.");
    const recipientsResponse = await fetch(
      `${apiUrl}/vaults/${vault.id}/items/${itemToShare!.id}/teams/${shareTeamId}/recipients`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const recipients: TeamShareRecipient[] = await recipientsResponse.json();
    if (!recipientsResponse.ok)
      throw new Error(
        await getApiMessage(
          recipientsResponse,
          "No fue posible obtener los destinatarios del equipo.",
        ),
      );
    if (!recipients.length)
      throw new Error("El equipo no tiene miembros activos con clave de compartición.");
    const envelopes = await Promise.all(
      recipients.map(async (recipient) => ({
        recipientId: recipient.id,
        ...(await createRecipientDocumentKeyEnvelope(
          documentKey,
          recipient.publicKey,
        )),
      })),
    );
    return fetch(
      `${apiUrl}/vaults/${vault.id}/items/${itemToShare!.id}/team-shares`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          teamId: shareTeamId,
          permission: sharePermission,
          ...(shareExpiresAt
            ? { expiresAt: new Date(shareExpiresAt).toISOString() }
            : {}),
          recipients: envelopes,
          ...promotion,
        }),
      },
    );
  }

  function openSharedItemEditor(item: DecryptedSharedVaultItem) {
    setSharedItemToEdit(item);
    setSharedItemTitle(item.value.title);
    setSharedItemNotes(item.value.notes ?? "");
  }

  function openSharedItemViewer(item: DecryptedSharedVaultItem) {
    setSharedItemToView(item);
    setIsSharedItemRevealed(false);
  }

  function closeSharedItemViewer() {
    setSharedItemToView(null);
    setIsSharedItemRevealed(false);
  }

  async function saveSharedItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sharedItemToEdit) return;
    setError("");
    setIsSavingSharedItem(true);
    try {
      const value = {
        ...sharedItemToEdit.value,
        title: sharedItemTitle,
        notes: sharedItemNotes.trim() || undefined,
      };
      const encrypted = await encryptVaultPayload(
        sharedItemToEdit.documentKey,
        value,
      );
      const response = await fetch(
        `${apiUrl}/vaults/shared-items/${sharedItemToEdit.vaultItemId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            type: sharedItemToEdit.type,
            ...encrypted,
            expectedVersion: sharedItemToEdit.version,
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          await getApiMessage(
            response,
            "No fue posible guardar el elemento compartido.",
          ),
        );
      setSharedItemToEdit(null);
      await loadSharedItems();
    } catch (sharedItemError) {
      setError(
        sharedItemError instanceof Error
          ? sharedItemError.message
          : "No fue posible guardar el elemento compartido.",
      );
    } finally {
      setIsSavingSharedItem(false);
    }
  }

  const folders = Array.from(
    new Set(
      [...items, ...sharedItems]
        .map((item) => item.value.folder)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();
  const sourceItems = vaultView === "trash" ? deletedItems : items;
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const passwordStrength = estimatePasswordStrength(password);
  const visibleItems = sourceItems.filter((item) => {
    if (vaultView === "all" && item.value.archived) return false;
    if (
      vaultView === "favorites" &&
      (!item.value.favorite || item.value.archived)
    )
      return false;
    if (vaultView === "archive" && !item.value.archived) return false;
    if (folderFilter && item.value.folder !== folderFilter) return false;
    if (!normalizedSearch) return true;
    return [
      item.value.title,
      item.value.username,
      item.value.website,
      item.value.fullName,
      item.value.email,
      item.value.folder,
      ...(item.value.tags ?? []),
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));
  });
  const visibleSharedItems =
    vaultView === "all"
      ? sharedItems.filter((item) => {
          if (folderFilter && item.value.folder !== folderFilter) return false;
          if (!normalizedSearch) return true;
          return [
            item.value.title,
            item.value.username,
            item.value.website,
            item.value.fullName,
            item.value.email,
            item.value.folder,
            ...(item.value.tags ?? []),
          ].some((value) =>
            value?.toLocaleLowerCase().includes(normalizedSearch),
          );
        })
      : [];
  const sharedItemFields = sharedItemToView
    ? [
        { key: "website", label: "Sitio web", value: sharedItemToView.value.website },
        { key: "username", label: "Usuario", value: sharedItemToView.value.username },
        { key: "password", label: "Contraseña", value: sharedItemToView.value.password, protected: true },
        { key: "cardholder", label: "Titular", value: sharedItemToView.value.cardholder },
        { key: "cardNumber", label: "Número de tarjeta", value: sharedItemToView.value.cardNumber, protected: true },
        { key: "expiry", label: "Vencimiento", value: sharedItemToView.value.expiry },
        { key: "securityCode", label: "Código de seguridad", value: sharedItemToView.value.securityCode, protected: true },
        { key: "fullName", label: "Nombre completo", value: sharedItemToView.value.fullName },
        { key: "email", label: "Correo electrónico", value: sharedItemToView.value.email },
        { key: "phone", label: "Teléfono", value: sharedItemToView.value.phone },
        { key: "address", label: "Dirección", value: sharedItemToView.value.address },
        { key: "notes", label: "Notas", value: sharedItemToView.value.notes, wide: true },
        ...(sharedItemToView.value.customFields ?? []).map((field, index) => ({
          key: `custom-${index}`,
          label: field.name,
          value: field.value,
          protected: field.protected,
        })),
      ].filter((field) => field.value)
    : [];

  return (
    <section className="vault-area">
      {error && <Alert severity="error">{error}</Alert>}
      <div className="vault-toolbar">
        <span>
          {items.length + sharedItems.length}{" "}
          {items.length + sharedItems.length === 1 ? "elemento" : "elementos"}
        </span>
        <div className="vault-toolbar-actions">
          {!canCreate && !canUpdate && !canDelete && (
            <span className="read-only-badge">Acceso de consulta</span>
          )}
          <Tooltip title="Actualizar elementos">
            <IconButton
              className="vault-refresh-button"
              aria-label="Actualizar elementos"
              onClick={() => void loadItems()}
            >
              <RefreshCw size={18} />
            </IconButton>
          </Tooltip>
          {canCreate && (
            <Button
              component="label"
              variant="outlined"
              startIcon={<Download size={17} />}
              disabled={isImporting}
            >
              {isImporting ? "Importando..." : "Importar"}
              <input
                hidden
                type="file"
                accept="application/json,.json"
                onChange={(event) => void importVault(event)}
              />
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<Upload size={17} />}
            onClick={() => void exportVault()}
          >
            Exportar
          </Button>
          {canCreate && (
            <Button
              variant="contained"
              startIcon={<Plus size={17} />}
              onClick={openNewCredential}
            >
              Nuevo elemento
            </Button>
          )}
        </div>
      </div>
      <div className="vault-organization-toolbar">
        <TextField
          className="vault-search"
          size="small"
          placeholder="Buscar en el vault"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={17} />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          select
          size="small"
          label="Carpeta"
          value={folderFilter}
          onChange={(event) => setFolderFilter(event.target.value)}
        >
          <MenuItem value="">Todas</MenuItem>
          {folders.map((folderName) => (
            <MenuItem key={folderName} value={folderName}>
              {folderName}
            </MenuItem>
          ))}
        </TextField>
        <ToggleButtonGroup
          className="vault-view-selector"
          size="small"
          value={vaultView}
          exclusive
          onChange={(_, value) => value && setVaultView(value)}
          aria-label="Vista del vault"
        >
          <ToggleButton value="all" aria-label="Todos">
            <KeyRound size={16} />
            <span>Todos</span>
          </ToggleButton>
          <ToggleButton value="favorites" aria-label="Favoritos">
            <Star size={16} />
            <span>Favoritos</span>
          </ToggleButton>
          <ToggleButton value="archive" aria-label="Archivo">
            <Archive size={16} />
            <span>Archivo</span>
          </ToggleButton>
          <ToggleButton value="trash" aria-label="Papelera">
            <Trash2 size={16} />
            <span>Papelera</span>
          </ToggleButton>
        </ToggleButtonGroup>
      </div>
      {visibleSharedItems.length > 0 && (
        <section className="shared-vault-section">
          <header>
            <div>
              <span className="shared-section-icon"><Users size={17} /></span>
              <div>
                <h2>Compartidos conmigo</h2>
                <p>Credenciales a las que otras personas te dieron acceso.</p>
              </div>
            </div>
            <span className="shared-section-count">
              {visibleSharedItems.length}
            </span>
          </header>
          <div className="shared-credential-list">
            {visibleSharedItems.map((item) => {
              const SharedItemIcon =
                item.type === "LOGIN"
                  ? KeyRound
                  : item.type === "SECURE_NOTE"
                    ? StickyNote
                    : item.type === "CARD"
                      ? CreditCard
                      : Contact;
              const itemLabel =
                item.type === "LOGIN"
                  ? "Inicio de sesión"
                  : item.type === "SECURE_NOTE"
                    ? "Nota segura"
                    : item.type === "CARD"
                      ? "Tarjeta"
                      : "Identidad";
              return (
                <article className="shared-credential-card" key={item.id}>
                  <span className="shared-credential-icon">
                    <SharedItemIcon size={18} />
                  </span>
                  <div className="shared-credential-identity">
                    <strong>{item.value.title}</strong>
                    <span>
                      {itemLabel}
                      {item.value.username ? ` · ${item.value.username}` : ""}
                    </span>
                  </div>
                  <span className={`shared-permission ${item.permission}`}>
                    {item.permission === "write" ? "Puede editar" : "Solo lectura"}
                  </span>
                  <div className="shared-credential-actions">
                    <Button
                      size="small"
                      startIcon={<Eye size={15} />}
                      onClick={() => openSharedItemViewer(item)}
                    >
                      Ver
                    </Button>
                    {item.permission === "write" && canUpdate && (
                      <Tooltip title="Editar elemento compartido">
                        <IconButton
                          aria-label={`Editar ${item.value.title}`}
                          onClick={() => openSharedItemEditor(item)}
                        >
                          <Pencil size={16} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
      {visibleItems.length === 0 && visibleSharedItems.length === 0 && (
        <section className="vault-empty compact-empty">
          <span className="empty-icon">
            {vaultView === "trash" ? (
              <Trash2 size={25} />
            ) : (
              <LockKeyhole size={25} />
            )}
          </span>
          <h2>
            {vaultView === "trash"
              ? "La papelera está vacía."
              : searchQuery || folderFilter || vaultView !== "all"
                ? "No hay resultados."
                : "Tu vault está listo."}
          </h2>
          <p>
            {vaultView === "trash"
              ? "Los elementos eliminados aparecerán aquí antes de borrarlos definitivamente."
              : canCreate
                ? "Agrega un elemento o ajusta los filtros de búsqueda."
                : "No hay elementos disponibles con los filtros actuales."}
          </p>
        </section>
      )}
      <div className="credential-list">
        {visibleItems.map((item) => {
          const isRevealed = revealedItemIds.includes(item.id);
          const itemLabel =
            item.type === "LOGIN"
              ? "Inicio de sesión"
              : item.type === "SECURE_NOTE"
                ? "Nota segura"
                : item.type === "CARD"
                  ? "Tarjeta"
                  : "Identidad";
          const ItemIcon =
            item.type === "LOGIN"
              ? KeyRound
              : item.type === "SECURE_NOTE"
                ? StickyNote
                : item.type === "CARD"
                  ? CreditCard
                  : Contact;
          const fields =
            item.type === "LOGIN"
              ? [
                  {
                    key: "website",
                    label: "Sitio web",
                    value: item.value.website,
                  },
                  {
                    key: "username",
                    label: "Usuario",
                    value: item.value.username,
                  },
                  {
                    key: "password",
                    label: "Contraseña",
                    value: item.value.password,
                    protected: true,
                  },
                ]
              : item.type === "CARD"
                ? [
                    {
                      key: "cardholder",
                      label: "Titular",
                      value: item.value.cardholder,
                    },
                    {
                      key: "cardNumber",
                      label: "Número",
                      value: item.value.cardNumber,
                      protected: true,
                    },
                    {
                      key: "expiry",
                      label: "Vencimiento",
                      value: item.value.expiry,
                    },
                    {
                      key: "securityCode",
                      label: "Código de seguridad",
                      value: item.value.securityCode,
                      protected: true,
                    },
                  ]
                : item.type === "IDENTITY"
                  ? [
                      {
                        key: "fullName",
                        label: "Nombre completo",
                        value: item.value.fullName,
                      },
                      {
                        key: "email",
                        label: "Correo electrónico",
                        value: item.value.email,
                      },
                      {
                        key: "phone",
                        label: "Teléfono",
                        value: item.value.phone,
                      },
                      {
                        key: "address",
                        label: "Dirección",
                        value: item.value.address,
                      },
                    ]
                  : [];
          const visibleFields = [
            ...fields,
            ...(item.value.notes
              ? [
                  {
                    key: "notes",
                    label: "Notas",
                    value: item.value.notes,
                    wide: true,
                  },
                ]
              : []),
            ...(item.value.customFields ?? []).map((field, index) => ({
              key: `custom-${index}`,
              label: field.name,
              value: field.value,
              protected: field.protected,
            })),
          ].filter((field) => field.value);
          return (
            <article key={item.id}>
              <header className="credential-heading">
                <span className="credential-icon">
                  <ItemIcon size={18} />
                </span>
                <div className="credential-title">
                  <strong>{item.value.title}</strong>
                  <span>
                    {itemLabel}
                    {item.value.folder ? ` · ${item.value.folder}` : ""}
                  </span>
                </div>
                <div className="credential-heading-actions">
                  {vaultView === "trash" ? (
                    <>
                      {canUpdate && (
                        <Tooltip title="Restaurar elemento">
                          <IconButton
                            aria-label={`Restaurar ${item.value.title}`}
                            onClick={() => void restoreItem(item)}
                          >
                            <RotateCcw size={17} />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canDelete && (
                        <Tooltip title="Eliminar definitivamente">
                          <IconButton
                            className="delete-credential-button"
                            aria-label={`Eliminar definitivamente ${item.value.title}`}
                            onClick={() =>
                              setItemPendingDeletion({
                                id: item.id,
                                title: item.value.title,
                                permanent: true,
                              })
                            }
                          >
                            <Trash2 size={17} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </>
                  ) : (
                    <>
                      {(canUpdate || canDelete) && (
                        <Tooltip title={canUpdate ? "Compartir elemento" : "Gestionar accesos"}>
                          <IconButton
                            aria-label={`${canUpdate ? "Compartir" : "Gestionar accesos de"} ${item.value.title}`}
                            onClick={() => void openShareDialog(item)}
                          >
                            <Users size={17} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Ver historial">
                        <IconButton
                          aria-label={`Historial de ${item.value.title}`}
                          onClick={() => void openItemHistory(item)}
                        >
                          <Clock3 size={17} />
                        </IconButton>
                      </Tooltip>
                      {canUpdate && (
                        <>
                          <Tooltip
                            title={item.value.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                          >
                            <IconButton
                              className={item.value.favorite ? "active-organization-action" : ""}
                              aria-label={`${item.value.favorite ? "Quitar de favoritos" : "Agregar a favoritos"} ${item.value.title}`}
                              onClick={() =>
                                void updateItemOrganization(item, {
                                  favorite: !item.value.favorite,
                                })
                              }
                            >
                              <Star
                                size={17}
                                fill={item.value.favorite ? "currentColor" : "none"}
                              />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={item.value.archived ? "Sacar del archivo" : "Archivar"}>
                            <IconButton
                              aria-label={`${item.value.archived ? "Sacar del archivo" : "Archivar"} ${item.value.title}`}
                              onClick={() =>
                                void updateItemOrganization(item, {
                                  archived: !item.value.archived,
                                })
                              }
                            >
                              {item.value.archived ? (
                                <ArchiveRestore size={17} />
                              ) : (
                                <Archive size={17} />
                              )}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Editar elemento">
                            <IconButton
                              aria-label={`Editar ${item.value.title}`}
                              onClick={() => openEditCredential(item)}
                            >
                              <Pencil size={17} />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {canDelete && (
                        <Tooltip title="Mover a la papelera">
                          <IconButton
                            className="delete-credential-button"
                            aria-label={`Eliminar ${item.value.title}`}
                            onClick={() =>
                              setItemPendingDeletion({
                                id: item.id,
                                title: item.value.title,
                              })
                            }
                          >
                            <Trash2 size={17} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </>
                  )}
                </div>
              </header>
              <div className="credential-fields">
                {visibleFields.map((field) => {
                  const wasCopied = copiedField === `${item.id}-${field.key}`;
                  return (
                    <div
                      key={field.key}
                      className={`credential-field ${"wide" in field && field.wide ? "credential-notes" : ""}`}
                    >
                      <div>
                        <span className="credential-label">{field.label}</span>
                        <span className="credential-value">
                          {"protected" in field &&
                          field.protected &&
                          !isRevealed
                            ? "••••••••••••"
                            : field.value}
                        </span>
                      </div>
                      {"protected" in field && field.protected && (
                        <Tooltip
                          title={
                            isRevealed
                              ? "Ocultar campos protegidos"
                              : "Mostrar campos protegidos"
                          }
                        >
                          <IconButton
                            aria-label={
                              isRevealed
                                ? "Ocultar campos protegidos"
                                : "Mostrar campos protegidos"
                            }
                            onClick={() =>
                              setRevealedItemIds((ids) =>
                                isRevealed
                                  ? ids.filter((id) => id !== item.id)
                                  : [...ids, item.id],
                              )
                            }
                          >
                            {isRevealed ? (
                              <EyeOff size={17} />
                            ) : (
                              <Eye size={17} />
                            )}
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip
                        title={
                          wasCopied
                            ? "Copiado"
                            : `Copiar ${field.label.toLowerCase()}`
                        }
                      >
                        <IconButton
                          aria-label={`Copiar ${field.label.toLowerCase()}`}
                          onClick={() =>
                            void copyCredentialField(
                              item.id,
                              field.key,
                              field.value!,
                            )
                          }
                        >
                          {wasCopied ? <Check size={17} /> : <Copy size={17} />}
                        </IconButton>
                      </Tooltip>
                    </div>
                  );
                })}
                {(item.value.tags?.length ?? 0) > 0 && (
                  <div className="credential-tags">
                    {item.value.tags!.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <Dialog
        open={isAdding}
        onClose={closeCredentialDialog}
        fullWidth
        maxWidth="sm"
        aria-labelledby="credential-dialog-title"
      >
        <form onSubmit={saveCredential}>
          <DialogTitle id="credential-dialog-title">
            {editingItemId ? "Editar elemento" : "Nuevo elemento"}
          </DialogTitle>
          <DialogContent className="credential-dialog-content">
            <ToggleButtonGroup
              className="item-type-selector"
              value={itemType}
              exclusive
              onChange={(_, value: VaultItemType | null) =>
                value && setItemType(value)
              }
              aria-label="Tipo de elemento"
              fullWidth
            >
              <ToggleButton value="LOGIN">
                <KeyRound size={17} />
                Acceso
              </ToggleButton>
              <ToggleButton value="SECURE_NOTE">
                <StickyNote size={17} />
                Nota
              </ToggleButton>
              <ToggleButton value="CARD">
                <CreditCard size={17} />
                Tarjeta
              </ToggleButton>
              <ToggleButton value="IDENTITY">
                <Contact size={17} />
                Identidad
              </ToggleButton>
            </ToggleButtonGroup>
            <TextField
              label="Nombre del elemento"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              fullWidth
              autoFocus
            />
            {itemType === "LOGIN" && (
              <>
                <TextField
                  label="Sitio web"
                  placeholder="https://ejemplo.com"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Usuario o correo"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  fullWidth
                />
                <TextField
                  label="Contraseña"
                  type={showNewPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  fullWidth
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            aria-label={
                              showNewPassword
                                ? "Ocultar contraseña"
                                : "Mostrar contraseña"
                            }
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            edge="end"
                          >
                            {showNewPassword ? (
                              <EyeOff size={19} />
                            ) : (
                              <Eye size={19} />
                            )}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <div
                  className={`password-strength ${passwordStrength.tone}`}
                  aria-live="polite"
                >
                  <div>
                    <span>Fortaleza</span>
                    <strong>{passwordStrength.label}</strong>
                  </div>
                  <LinearProgress
                    variant="determinate"
                    value={passwordStrength.score}
                    aria-label={`Fortaleza: ${passwordStrength.label}`}
                  />
                </div>
                <div className="password-generator">
                  <ToggleButtonGroup
                    size="small"
                    value={generatorMode}
                    exclusive
                    onChange={(_, mode: "password" | "passphrase" | null) =>
                      mode && setGeneratorMode(mode)
                    }
                    aria-label="Modo del generador"
                  >
                    <ToggleButton value="password">Contraseña</ToggleButton>
                    <ToggleButton value="passphrase">Frase segura</ToggleButton>
                  </ToggleButtonGroup>
                  {generatorMode === "password" ? (
                    <>
                      <label htmlFor="password-length">
                        Longitud: {passwordLength}
                      </label>
                      <input
                        id="password-length"
                        type="range"
                        min="8"
                        max="64"
                        value={passwordLength}
                        onChange={(event) =>
                          setPasswordLength(Number(event.target.value))
                        }
                      />
                      <Button
                        type="button"
                        variant="outlined"
                        startIcon={<RefreshCw size={16} />}
                        onClick={generatePassword}
                      >
                        Generar
                      </Button>
                    </>
                  ) : (
                    <>
                      <label htmlFor="phrase-words">
                        Palabras: {phraseWordCount}
                      </label>
                      <input
                        id="phrase-words"
                        type="range"
                        min="4"
                        max="8"
                        value={phraseWordCount}
                        onChange={(event) =>
                          setPhraseWordCount(Number(event.target.value))
                        }
                      />
                      <Button
                        type="button"
                        variant="outlined"
                        startIcon={<RefreshCw size={16} />}
                        onClick={generatePassphrase}
                      >
                        Generar frase
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
            {itemType === "CARD" && (
              <div className="dialog-field-grid">
                <TextField
                  className="full-field"
                  label="Nombre del titular"
                  value={cardholder}
                  onChange={(event) => setCardholder(event.target.value)}
                  required
                />
                <TextField
                  className="full-field"
                  label="Número de tarjeta"
                  value={cardNumber}
                  onChange={(event) => setCardNumber(event.target.value)}
                  required
                />
                <TextField
                  label="Vencimiento"
                  placeholder="MM/AA"
                  value={expiry}
                  onChange={(event) => setExpiry(event.target.value)}
                  required
                />
                <TextField
                  label="Código de seguridad"
                  type={showNewPassword ? "text" : "password"}
                  value={securityCode}
                  onChange={(event) => setSecurityCode(event.target.value)}
                  required
                />
              </div>
            )}
            {itemType === "IDENTITY" && (
              <div className="dialog-field-grid">
                <TextField
                  className="full-field"
                  label="Nombre completo"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
                <TextField
                  label="Correo electrónico"
                  type="email"
                  value={identityEmail}
                  onChange={(event) => setIdentityEmail(event.target.value)}
                />
                <TextField
                  label="Teléfono"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
                <TextField
                  className="full-field"
                  label="Dirección"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  multiline
                  minRows={2}
                />
              </div>
            )}
            <TextField
              label="Notas (opcional)"
              placeholder="Información adicional sobre esta cuenta"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              multiline
              minRows={3}
              fullWidth
            />
            <div className="dialog-field-grid">
              <TextField
                label="Carpeta (opcional)"
                placeholder="Trabajo"
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
              />
              <TextField
                label="Etiquetas"
                placeholder="producción, infraestructura"
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
              />
            </div>
            <section className="custom-fields-editor">
              <div className="custom-fields-heading">
                <div>
                  <strong>Campos personalizados</strong>
                  <span>Se cifran junto con el resto del elemento.</span>
                </div>
                <Button
                  type="button"
                  variant="text"
                  startIcon={<Plus size={16} />}
                  onClick={() =>
                    setCustomFields((fields) => [
                      ...fields,
                      { name: "", value: "", protected: false },
                    ])
                  }
                >
                  Agregar campo
                </Button>
              </div>
              {customFields.map((field, index) => (
                <div className="custom-field-row" key={index}>
                  <TextField
                    label="Nombre"
                    size="small"
                    value={field.name}
                    onChange={(event) =>
                      updateCustomField(index, { name: event.target.value })
                    }
                  />
                  <TextField
                    label="Valor"
                    size="small"
                    type={
                      field.protected && !showNewPassword ? "password" : "text"
                    }
                    value={field.value}
                    onChange={(event) =>
                      updateCustomField(index, { value: event.target.value })
                    }
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={field.protected}
                        onChange={(event) =>
                          updateCustomField(index, {
                            protected: event.target.checked,
                          })
                        }
                      />
                    }
                    label="Protegido"
                  />
                  <Tooltip title="Quitar campo">
                    <IconButton
                      aria-label="Quitar campo"
                      onClick={() =>
                        setCustomFields((fields) =>
                          fields.filter(
                            (_, fieldIndex) => fieldIndex !== index,
                          ),
                        )
                      }
                    >
                      <X size={17} />
                    </IconButton>
                  </Tooltip>
                </div>
              ))}
            </section>
          </DialogContent>
          <DialogActions>
            <Button
              type="button"
              onClick={closeCredentialDialog}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button variant="contained" type="submit" disabled={isSaving}>
              {isSaving ? "Guardando..." : "Guardar elemento"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(itemPendingDeletion)}
        onClose={() => !isDeleting && setItemPendingDeletion(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="delete-credential-title"
      >
        <DialogTitle id="delete-credential-title">
          {itemPendingDeletion?.permanent
            ? "Eliminar definitivamente"
            : "Mover a la papelera"}
        </DialogTitle>
        <DialogContent>
          <p className="delete-dialog-copy">
            {itemPendingDeletion?.permanent ? (
              <>
                El elemento <strong>{itemPendingDeletion.title}</strong> y su
                historial cifrado se eliminarán definitivamente. Esta acción no
                se puede deshacer.
              </>
            ) : (
              <>
                El elemento <strong>{itemPendingDeletion?.title}</strong> se
                moverá a la papelera y podrás restaurarlo más adelante.
              </>
            )}
          </p>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setItemPendingDeletion(null)}
            disabled={isDeleting}
          >
            Cancelar
          </Button>
          <Button
            className="confirm-delete-button"
            variant="contained"
            onClick={() => void deleteCredential()}
            disabled={isDeleting}
          >
            {isDeleting ? "Eliminando..." : "Eliminar"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(historyItemTitle)}
        onClose={() =>
          !isRestoringRevision &&
          (setHistoryItemTitle(""), setHistoryItemId(""))
        }
        fullWidth
        maxWidth="sm"
        aria-labelledby="item-history-title"
      >
        <DialogTitle id="item-history-title">
          Historial de {historyItemTitle}
        </DialogTitle>
        <DialogContent className="history-dialog-content">
          {isLoadingHistory ? (
            <p>Cargando versiones cifradas...</p>
          ) : historyRevisions.length === 0 ? (
            <p>Aún no hay versiones anteriores de este elemento.</p>
          ) : (
            historyRevisions.map((revision) => (
              <article key={revision.id}>
                <div>
                  <strong>Versión {revision.version}</strong>
                  <span>
                    {new Intl.DateTimeFormat("es", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(revision.createdAt))}
                  </span>
                </div>
                <span>{revision.value.title}</span>
                <p>
                  {revision.value.username ??
                    revision.value.website ??
                    revision.value.cardholder ??
                    revision.value.fullName ??
                    "Contenido cifrado actualizado"}
                </p>
                {canUpdate && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<RotateCcw size={16} />}
                    onClick={() => void restoreItemRevision(revision.id)}
                    disabled={isRestoringRevision}
                  >
                    {isRestoringRevision
                      ? "Restaurando..."
                      : "Restaurar esta revisión"}
                  </Button>
                )}
              </article>
            ))
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setHistoryItemTitle("");
              setHistoryItemId("");
            }}
            disabled={isRestoringRevision}
          >
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(itemToShare)}
        onClose={() => !isSharing && setItemToShare(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="share-item-title"
      >
        <form onSubmit={shareItem}>
          <DialogTitle id="share-item-title">
            {canUpdate ? "Compartir" : "Accesos de"} {itemToShare?.value.title}
          </DialogTitle>
          <DialogContent className="share-dialog-content">
            {canUpdate ? (
              <>
                <p>
                  El contenido se cifra con una clave de documento compartida; la
                  clave del vault nunca se comparte.
                </p>
                <ToggleButtonGroup
                  value={shareMode}
                  exclusive
                  fullWidth
                  onChange={(_, value: "individual" | "team" | null) =>
                    value && setShareMode(value)
                  }
                  aria-label="Destino de la compartición"
                >
                  <ToggleButton value="individual">Persona</ToggleButton>
                  <ToggleButton value="team">Equipo</ToggleButton>
                </ToggleButtonGroup>
                {shareMode === "individual" ? (
                  <TextField
                    label="Correo del destinatario"
                    type="email"
                    value={shareRecipientEmail}
                    onChange={(event) => setShareRecipientEmail(event.target.value)}
                    required
                    fullWidth
                    autoFocus
                  />
                ) : (
                  <TextField
                    select
                    label="Equipo"
                    value={shareTeamId}
                    onChange={(event) => setShareTeamId(event.target.value)}
                    required
                    fullWidth
                  >
                    {shareTeams.length === 0 && (
                      <MenuItem value="" disabled>
                        No hay equipos de tus organizaciones
                      </MenuItem>
                    )}
                    {shareTeams.map((team) => (
                      <MenuItem key={team.id} value={team.id}>
                        {team.organizationName} · {team.name}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                <TextField
                  select
                  label="Permiso"
                  value={sharePermission}
                  onChange={(event) =>
                    setSharePermission(event.target.value as "read" | "write")
                  }
                  fullWidth
                >
                  <MenuItem value="read">Solo lectura</MenuItem>
                  <MenuItem value="write">Puede editar</MenuItem>
                </TextField>
                <TextField
                  label="Caduca el"
                  type="datetime-local"
                  value={shareExpiresAt}
                  onChange={(event) => setShareExpiresAt(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  fullWidth
                  helperText="Déjalo vacío para mantener el acceso sin fecha de caducidad."
                />
              </>
            ) : (
              <p>Consulta los accesos activos y revoca los que ya no correspondan.</p>
            )}
            <section className="share-overview" aria-label="Accesos existentes">
              <div className="share-overview-heading">
                <strong>Accesos existentes</strong>
                {isLoadingShareOverview && <LinearProgress />}
              </div>
              {!isLoadingShareOverview &&
                itemShareOverview?.directShares.length === 0 &&
                itemShareOverview?.teamShares.length === 0 && (
                  <span className="share-overview-empty">
                    Este elemento aún no está compartido.
                  </span>
                )}
              {itemShareOverview?.directShares.map((share) => {
                const isExpired =
                  Boolean(share.expiresAt) &&
                  new Date(share.expiresAt!).getTime() <= Date.now();
                const status = share.revokedAt
                  ? "Revocado"
                  : isExpired
                    ? "Caducado"
                    : "Activo";
                return (
                  <article key={share.id} className="share-overview-row">
                    <div>
                      <strong>{share.recipient.displayName}</strong>
                      <span>{share.recipient.email} · Directo · {share.permission === "write" ? "Puede editar" : "Solo lectura"}</span>
                      <small>
                        {status}
                        {share.expiresAt
                          ? ` · caduca ${new Date(share.expiresAt).toLocaleDateString()}`
                          : ""}
                      </small>
                    </div>
                    {canDelete && !share.revokedAt && !isExpired && (
                      <Tooltip title="Revocar acceso directo">
                        <IconButton
                          aria-label={`Revocar acceso de ${share.recipient.displayName}`}
                          onClick={() => void revokeShare("direct", share.recipient.id)}
                          disabled={isRevokingShare || isSharing}
                        >
                          <X size={17} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </article>
                );
              })}
              {itemShareOverview?.teamShares.map((share) => (
                (() => {
                  const isExpired =
                    Boolean(share.expiresAt) &&
                    new Date(share.expiresAt!).getTime() <= Date.now();
                  return (
                    <article key={share.id} className="share-overview-row">
                      <div>
                        <strong>{share.team.name}</strong>
                        <span>Equipo · {share.permission === "write" ? "Puede editar" : "Solo lectura"}</span>
                        <small>
                          {share.revokedAt
                            ? "Revocado"
                            : isExpired
                              ? "Caducado"
                              : `Activo · ${share._count.shares} miembros con acceso`}
                          {share.expiresAt
                            ? ` · caduca ${new Date(share.expiresAt).toLocaleDateString()}`
                            : ""}
                        </small>
                      </div>
                      {canDelete && !share.revokedAt && !isExpired && (
                        <Tooltip title="Revocar acceso del equipo">
                          <IconButton
                            aria-label={`Revocar acceso del equipo ${share.team.name}`}
                            onClick={() => void revokeShare("team", share.team.id)}
                            disabled={isRevokingShare || isSharing}
                          >
                            <X size={17} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </article>
                  );
                })()
              ))}
            </section>
          </DialogContent>
          <DialogActions>
            <Button
              type="button"
              onClick={() => setItemToShare(null)}
              disabled={isSharing}
            >
              Cancelar
            </Button>
            {canUpdate && (
              <Button type="submit" variant="contained" disabled={isSharing}>
                {isSharing ? "Cifrando..." : "Compartir"}
              </Button>
            )}
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(sharedItemToView)}
        onClose={closeSharedItemViewer}
        fullWidth
        maxWidth="sm"
        aria-labelledby="shared-item-view-title"
      >
        <DialogTitle id="shared-item-view-title">
          <span className="shared-view-title">
            <span className="shared-credential-icon"><Eye size={18} /></span>
            <span>
              <strong>{sharedItemToView?.value.title}</strong>
              <small>Elemento compartido</small>
            </span>
          </span>
        </DialogTitle>
        <DialogContent className="shared-view-content">
          <div className="shared-view-meta">
            <span className={`shared-permission ${sharedItemToView?.permission ?? "read"}`}>
              {sharedItemToView?.permission === "write" ? "Puede editar" : "Solo lectura"}
            </span>
            {sharedItemToView?.value.folder && (
              <span>Carpeta · {sharedItemToView.value.folder}</span>
            )}
          </div>
          {sharedItemFields.length === 0 ? (
            <p className="shared-view-empty">Este elemento no contiene campos adicionales.</p>
          ) : (
            <div className="shared-view-fields">
              {sharedItemFields.map((field) => {
                const fieldId = `${sharedItemToView!.id}-${field.key}`;
                const isProtected = "protected" in field && field.protected;
                return (
                  <div
                    className={`shared-view-field ${"wide" in field && field.wide ? "wide" : ""}`}
                    key={field.key}
                  >
                    <span>{field.label}</span>
                    <div>
                      <strong>
                        {isProtected && !isSharedItemRevealed
                          ? "••••••••••••"
                          : field.value}
                      </strong>
                      {isProtected && (
                        <Tooltip title={isSharedItemRevealed ? "Ocultar" : "Mostrar"}>
                          <IconButton
                            aria-label={`${isSharedItemRevealed ? "Ocultar" : "Mostrar"} ${field.label}`}
                            onClick={() => setIsSharedItemRevealed((revealed) => !revealed)}
                          >
                            {isSharedItemRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title={copiedField === fieldId ? "Copiado" : "Copiar"}>
                        <IconButton
                          aria-label={`Copiar ${field.label}`}
                          onClick={() =>
                            void copyCredentialField(
                              sharedItemToView!.id,
                              field.key,
                              String(field.value),
                            )
                          }
                        >
                          {copiedField === fieldId ? <Check size={16} /> : <Copy size={16} />}
                        </IconButton>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeSharedItemViewer}>Cerrar</Button>
          {sharedItemToView?.permission === "write" && canUpdate && (
            <Button
              variant="contained"
              startIcon={<Pencil size={16} />}
              onClick={() => {
                const item = sharedItemToView;
                closeSharedItemViewer();
                openSharedItemEditor(item);
              }}
            >
              Editar
            </Button>
          )}
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(sharedItemToEdit)}
        onClose={() => !isSavingSharedItem && setSharedItemToEdit(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="shared-item-edit-title"
      >
        <form onSubmit={saveSharedItem}>
          <DialogTitle id="shared-item-edit-title">
            Editar elemento compartido
          </DialogTitle>
          <DialogContent className="share-dialog-content">
            <TextField
              label="Nombre"
              value={sharedItemTitle}
              onChange={(event) => setSharedItemTitle(event.target.value)}
              required
              fullWidth
              autoFocus
            />
            <TextField
              label="Notas"
              value={sharedItemNotes}
              onChange={(event) => setSharedItemNotes(event.target.value)}
              multiline
              minRows={4}
              fullWidth
            />
          </DialogContent>
          <DialogActions>
            <Button
              type="button"
              onClick={() => setSharedItemToEdit(null)}
              disabled={isSavingSharedItem}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSavingSharedItem}
            >
              {isSavingSharedItem ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </section>
  );
}

function LegacyOrganizationsPanel({ accessToken }: { accessToken: string }) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [teamName, setTeamName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedOrganization =
    organizations.find(
      (organization) => organization.id === selectedOrganizationId,
    ) ?? organizations[0];
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  async function loadOrganizations() {
    const response = await fetch(`${apiUrl}/organizations`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(
        payload.message ?? "No fue posible cargar las organizaciones.",
      );
    setOrganizations(payload);
    setSelectedOrganizationId((currentId) =>
      payload.some(
        (organization: Organization) => organization.id === currentId,
      )
        ? currentId
        : (payload[0]?.id ?? ""),
    );
  }

  useEffect(() => {
    void loadOrganizations().catch((loadError) =>
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No fue posible cargar las organizaciones.",
      ),
    );
  }, [accessToken]);

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/organizations`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: organizationName }),
      });
      const organization = await response.json();
      if (!response.ok)
        throw new Error(
          organization.message ?? "No fue posible crear la organización.",
        );
      setOrganizations((existingOrganizations) => [
        ...existingOrganizations,
        organization,
      ]);
      setSelectedOrganizationId(organization.id);
      setOrganizationName("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No fue posible crear la organización.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrganization) return;
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${apiUrl}/organizations/${selectedOrganization.id}/members`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ email: memberEmail }),
        },
      );
      const member = await response.json();
      if (!response.ok)
        throw new Error(
          member.message ?? "No fue posible incorporar al miembro.",
        );
      setOrganizations((existingOrganizations) =>
        existingOrganizations.map((organization) =>
          organization.id === selectedOrganization.id
            ? { ...organization, members: [...organization.members, member] }
            : organization,
        ),
      );
      setMemberEmail("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No fue posible incorporar al miembro.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrganization) return;
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${apiUrl}/organizations/${selectedOrganization.id}/teams`,
        { method: "POST", headers, body: JSON.stringify({ name: teamName }) },
      );
      const team = await response.json();
      if (!response.ok)
        throw new Error(team.message ?? "No fue posible crear el equipo.");
      setOrganizations((existingOrganizations) =>
        existingOrganizations.map((organization) =>
          organization.id === selectedOrganization.id
            ? { ...organization, teams: [...organization.teams, team] }
            : organization,
        ),
      );
      setTeamName("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No fue posible crear el equipo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="organizations-panel">
      {error && <Alert severity="error">{error}</Alert>}
      <div className="organizations-intro">
        <div>
          <p className="section-label">ESPACIO DE EQUIPO</p>
          <h2>Organizaciones</h2>
          <p>
            Crea espacios de trabajo y prepara los equipos que compartirán
            secretos cifrados.
          </p>
        </div>
        <form onSubmit={createOrganization}>
          <TextField
            label="Nombre de la organización"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            required
          />
          <Button
            variant="contained"
            type="submit"
            startIcon={<Plus size={16} />}
            disabled={isSubmitting}
          >
            Crear organización
          </Button>
        </form>
      </div>
      {organizations.length === 0 ? (
        <section className="vault-empty compact-empty">
          <span className="empty-icon">
            <Building2 size={25} />
          </span>
          <h2>Tu primer espacio de equipo.</h2>
          <p>
            Crea una organización para empezar a gestionar miembros y equipos.
          </p>
        </section>
      ) : (
        <div className="organization-layout">
          <aside className="organization-list" aria-label="Organizaciones">
            {organizations.map((organization) => (
              <button
                key={organization.id}
                className={
                  selectedOrganization?.id === organization.id ? "selected" : ""
                }
                onClick={() => setSelectedOrganizationId(organization.id)}
              >
                <Building2 size={17} />
                <span>{organization.name}</span>
                <small>{organization.members.length} miembros</small>
              </button>
            ))}
          </aside>
          {selectedOrganization && (
            <section className="organization-details">
              <header>
                <div>
                  <h3>{selectedOrganization.name}</h3>
                  <span>
                    {selectedOrganization.members.length} miembros ·{" "}
                    {selectedOrganization.teams.length} equipos
                  </span>
                </div>
              </header>
              <div className="organization-detail-grid">
                <section>
                  <div className="organization-section-heading">
                    <div>
                      <h4>Miembros</h4>
                      <p>Solo usuarios activos pueden unirse.</p>
                    </div>
                  </div>
                  <form
                    className="organization-inline-form"
                    onSubmit={addMember}
                  >
                    <TextField
                      label="Correo del miembro"
                      type="email"
                      value={memberEmail}
                      onChange={(event) => setMemberEmail(event.target.value)}
                      required
                    />
                    <Button
                      type="submit"
                      variant="outlined"
                      disabled={isSubmitting}
                    >
                      Incorporar
                    </Button>
                  </form>
                  <div className="member-list">
                    {selectedOrganization.members.map((member) => (
                      <div key={member.user.id}>
                        <span className="profile-initial">
                          {member.user.displayName.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <strong>{member.user.displayName}</strong>
                          <span>{member.user.email}</span>
                        </div>
                        <small>
                          {member.role === "OWNER"
                            ? "Propietario"
                            : member.role === "ADMIN"
                              ? "Administrador"
                              : "Miembro"}
                        </small>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <div className="organization-section-heading">
                    <div>
                      <h4>Equipos</h4>
                      <p>Organiza a los miembros antes de compartir.</p>
                    </div>
                  </div>
                  <form
                    className="organization-inline-form"
                    onSubmit={createTeam}
                  >
                    <TextField
                      label="Nombre del equipo"
                      value={teamName}
                      onChange={(event) => setTeamName(event.target.value)}
                      required
                    />
                    <Button
                      type="submit"
                      variant="outlined"
                      disabled={isSubmitting}
                    >
                      Crear equipo
                    </Button>
                  </form>
                  <div className="team-list">
                    {selectedOrganization.teams.length === 0 ? (
                      <p>Aún no hay equipos.</p>
                    ) : (
                      selectedOrganization.teams.map((team) => (
                        <div key={team.id}>
                          <Users size={18} />
                          <div>
                            <strong>{team.name}</strong>
                            <span>{team.members.length} miembros</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </section>
          )}
        </div>
      )}
    </section>
  );
}

function LegacyAdminPanel({
  accessToken,
  section,
}: {
  accessToken: string;
  section: string;
}) {
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");
  const endpointBySection: Record<string, string> = {
    users: "users",
    roles: "roles",
    navigation: "navigation",
    audit: "audit",
  };

  useEffect(() => {
    async function loadRecords() {
      setError("");
      setRecords([]);
      const endpoint = endpointBySection[section];
      if (!endpoint) return;
      const response = await fetch(`${apiUrl}/admin/${endpoint}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = await response.json();
      if (!response.ok)
        return setError(
          payload.message ?? "No fue posible cargar la administración.",
        );
      setRecords(payload);
    }
    void loadRecords();
  }, [accessToken, section]);

  return (
    <section className="admin-panel">
      {error && <Alert severity="error">{error}</Alert>}
      {!error && records.length === 0 && (
        <p className="admin-empty">No hay registros para mostrar.</p>
      )}
      {records.map((record, index) => (
        <article key={String(record.id ?? index)}>
          {Object.entries(record)
            .filter(
              ([key]) =>
                !["id", "passwordHash", "encryptedData", "nonce"].includes(key),
            )
            .map(([key, value]) => (
              <div key={key}>
                <span>{key}</span>
                <strong>
                  {typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value ?? "-")}
                </strong>
              </div>
            ))}
        </article>
      ))}
    </section>
  );
}

void LegacyOrganizationsPanel;
void LegacyAdminPanel;

function OrganizationsManagement({
  accessToken,
  userId,
  permissions,
}: {
  accessToken: string;
  userId: string;
  permissions: string[];
}) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [activeOrganizationView, setActiveOrganizationView] = useState<
    "members" | "teams"
  >("members");
  const [organizationName, setOrganizationName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [teamName, setTeamName] = useState("");
  const [organizationDialog, setOrganizationDialog] = useState<
    "create" | "member" | "team" | null
  >(null);
  const [teamForMember, setTeamForMember] = useState<
    Organization["teams"][number] | null
  >(null);
  const [teamMemberEmail, setTeamMemberEmail] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<
    | { kind: "member"; id: string; name: string }
    | { kind: "team"; id: string; name: string }
    | { kind: "teamMember"; id: string; teamId: string; name: string }
    | { kind: "organization"; id: string; name: string }
    | null
  >(null);
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const selectedOrganization =
    organizations.find((organization) => organization.id === selectedId) ??
    organizations[0];
  const canCreate = permissions.includes("organizations.create");
  const canUpdate = permissions.includes("organizations.update");
  const canDelete = permissions.includes("organizations.delete");
  const isOwner = Boolean(
    selectedOrganization?.members.some(
      (member) => member.user.id === userId && member.role === "OWNER",
    ),
  );
  const canManage = canUpdate && isOwner;
  const canRemove = canDelete && isOwner;

  async function loadOrganizations() {
    const response = await fetch(`${apiUrl}/organizations`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = (await response.json()) as
      | Organization[]
      | { message?: string };
    if (!response.ok) {
      throw new Error(
        !Array.isArray(payload) && typeof payload.message === "string"
          ? payload.message
          : "No fue posible cargar las organizaciones.",
      );
    }
    if (!Array.isArray(payload)) {
      throw new Error("La respuesta de organizaciones no es válida.");
    }
    setOrganizations(payload);
    setSelectedId((current) =>
      payload.some((organization) => organization.id === current)
        ? current
        : (payload[0]?.id ?? ""),
    );
  }

  useEffect(() => {
    void loadOrganizations().catch((loadError) =>
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No fue posible cargar las organizaciones.",
      ),
    );
  }, [accessToken]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    path: string,
    body: object,
    clear: () => void,
    successMessage: string,
  ) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/organizations${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error(
          await getApiMessage(response, "No fue posible guardar los cambios."),
        );
      const payload = await response.json();
      if (!path) setSelectedId(payload.id);
      clear();
      await loadOrganizations();
      setMessage(successMessage);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No fue posible guardar los cambios.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function removePendingItem() {
    if (!selectedOrganization || !pendingRemoval) return;
    setError("");
    setMessage("");
    setIsSubmitting(true);
    try {
      const path = (() => {
        if (pendingRemoval.kind === "organization") return "";
        if (pendingRemoval.kind === "member")
          return `/members/${pendingRemoval.id}`;
        if (pendingRemoval.kind === "team")
          return `/teams/${pendingRemoval.id}`;
        return `/teams/${pendingRemoval.teamId}/members/${pendingRemoval.id}`;
      })();
      const response = await fetch(
        `${apiUrl}/organizations/${
          pendingRemoval.kind === "organization"
            ? pendingRemoval.id
            : selectedOrganization.id
        }${path}`,
        { method: "DELETE", headers },
      );
      if (!response.ok)
        throw new Error(
          await getApiMessage(
            response,
            "No fue posible completar la eliminación.",
          ),
        );
      const successMessage =
        pendingRemoval.kind === "organization"
          ? "Organización eliminada."
          : pendingRemoval.kind === "team"
            ? "Equipo eliminado."
            : "Miembro retirado.";
      setPendingRemoval(null);
      setDeletionConfirmation("");
      await loadOrganizations();
      setMessage(successMessage);
    } catch (removalError) {
      setError(
        removalError instanceof Error
          ? removalError.message
          : "No fue posible completar la eliminación.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function openRemoval(removal: NonNullable<typeof pendingRemoval>) {
    setDeletionConfirmation("");
    setPendingRemoval(removal);
  }

  function closeRemoval() {
    setPendingRemoval(null);
    setDeletionConfirmation("");
  }

  function roleLabel(role: OrganizationMember["role"]) {
    if (role === "OWNER") return "Propietario";
    if (role === "ADMIN") return "Administrador";
    return "Miembro";
  }

  return (
    <section className="organizations-panel">
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      <div className="organizations-overview">
        <div>
          <p className="section-label">DIRECTORIO DE ACCESO</p>
          <h2>Organizaciones</h2>
          <p>Controla quién colabora y cómo se distribuye el acceso compartido.</p>
        </div>
        {canCreate ? (
          <Button
            variant="contained"
            startIcon={<Plus size={17} />}
            onClick={() => setOrganizationDialog("create")}
          >
            Nueva organización
          </Button>
        ) : (
          <span className="read-only-badge">
            <Eye size={15} /> Acceso de consulta
          </span>
        )}
      </div>
      {organizations.length === 0 ? (
        <section className="vault-empty compact-empty">
          <span className="empty-icon">
            <Building2 size={25} />
          </span>
          <h2>No hay organizaciones disponibles</h2>
          <p>
            {canCreate
              ? "Crea el primer espacio para organizar personas y equipos."
              : "Cuando te incorporen a una organización, aparecerá en este espacio."}
          </p>
          {canCreate && (
            <Button
              variant="contained"
              startIcon={<Plus size={17} />}
              onClick={() => setOrganizationDialog("create")}
            >
              Crear organización
            </Button>
          )}
        </section>
      ) : (
        <div className="organization-layout">
          <aside className="organization-list" aria-label="Organizaciones">
            <header>
              <span>Espacios</span>
              <small>{organizations.length}</small>
            </header>
            {organizations.map((organization) => (
              <button
                type="button"
                key={organization.id}
                className={
                  selectedOrganization?.id === organization.id ? "selected" : ""
                }
                onClick={() => {
                  setSelectedId(organization.id);
                  setActiveOrganizationView("members");
                }}
              >
                <span className="organization-list-mark">
                  {organization.name.charAt(0).toUpperCase()}
                </span>
                <span>
                  <strong>{organization.name}</strong>
                  <small>{organization.members.length} miembros</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </aside>
          {selectedOrganization && (
            <section className="organization-details">
              <header className="organization-command-header">
                <span className="organization-monogram" aria-hidden="true">
                  {selectedOrganization.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part.charAt(0).toUpperCase())
                    .join("")}
                </span>
                <div>
                  <span className="organization-context">
                    {isOwner ? "Tu organización" : "Organización compartida"}
                  </span>
                  <h3>{selectedOrganization.name}</h3>
                </div>
                <div className="organization-header-metrics">
                  <span><strong>{selectedOrganization.members.length}</strong> miembros</span>
                  <span><strong>{selectedOrganization.teams.length}</strong> equipos</span>
                </div>
                {canRemove && (
                  <Tooltip title="Eliminar organización">
                    <IconButton
                      className="organization-delete-button"
                      aria-label={`Eliminar organización ${selectedOrganization.name}`}
                      onClick={() =>
                        openRemoval({
                          kind: "organization",
                          id: selectedOrganization.id,
                          name: selectedOrganization.name,
                        })
                      }
                    >
                      <Trash2 size={18} />
                    </IconButton>
                  </Tooltip>
                )}
              </header>
              {!isOwner && (canUpdate || canDelete) && (
                <div className="organization-owner-notice">
                  <ShieldCheck size={16} /> Sólo el propietario puede modificar este espacio.
                </div>
              )}
              <nav className="organization-tabs" aria-label="Contenido de la organización">
                <button
                  type="button"
                  className={activeOrganizationView === "members" ? "active" : ""}
                  onClick={() => setActiveOrganizationView("members")}
                >
                  <Users size={16} /> Miembros <span>{selectedOrganization.members.length}</span>
                </button>
                <button
                  type="button"
                  className={activeOrganizationView === "teams" ? "active" : ""}
                  onClick={() => setActiveOrganizationView("teams")}
                >
                  <Building2 size={16} /> Equipos <span>{selectedOrganization.teams.length}</span>
                </button>
              </nav>
              <div className="organization-detail-grid">
                {activeOrganizationView === "members" && <section>
                  <div className="organization-section-heading">
                    <div>
                      <h4>Directorio de miembros</h4>
                      <p>Personas con acceso a este espacio y sus equipos.</p>
                    </div>
                    {canManage && (
                      <Button
                        variant="contained"
                        startIcon={<UserPlus size={16} />}
                        onClick={() => setOrganizationDialog("member")}
                      >
                        Agregar miembro
                      </Button>
                    )}
                  </div>
                  <div className="member-list">
                    {selectedOrganization.members.map((member) => (
                      <div key={member.user.id}>
                        <span className="profile-initial">
                          {member.user.displayName.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <strong>{member.user.displayName}</strong>
                          <span>{member.user.email}</span>
                        </div>
                        <small className={`member-role ${member.role.toLowerCase()}`}>
                          {roleLabel(member.role)}
                        </small>
                        {canRemove && member.role !== "OWNER" && (
                          <Tooltip title="Quitar miembro">
                            <IconButton
                              aria-label={`Quitar a ${member.user.displayName}`}
                              onClick={() =>
                                openRemoval({
                                  kind: "member",
                                  id: member.user.id,
                                  name: member.user.displayName,
                                })
                              }
                              disabled={isSubmitting}
                            >
                              <Trash2 size={16} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </div>
                    ))}
                  </div>
                </section>}
                {activeOrganizationView === "teams" && <section>
                  <div className="organization-section-heading">
                    <div>
                      <h4>Equipos de acceso</h4>
                      <p>Agrupa miembros para compartir secretos de forma consistente.</p>
                    </div>
                    {canManage && (
                      <Button
                        variant="contained"
                        startIcon={<Plus size={16} />}
                        onClick={() => setOrganizationDialog("team")}
                      >
                        Crear equipo
                      </Button>
                    )}
                  </div>
                  <div className="team-list">
                    {selectedOrganization.teams.length === 0 ? (
                      <div className="organization-view-empty">
                        <span><Users size={22} /></span>
                        <strong>Aún no hay equipos</strong>
                        <p>Crea un equipo para compartir con un grupo estable.</p>
                        {canManage && (
                          <Button
                            variant="outlined"
                            onClick={() => setOrganizationDialog("team")}
                          >
                            Crear primer equipo
                          </Button>
                        )}
                      </div>
                    ) : (
                      selectedOrganization.teams.map((team) => {
                        const availableMembers = selectedOrganization.members.filter(
                          (member) =>
                            !team.members.some(
                              (teamMember) =>
                                teamMember.membership.user.id === member.user.id,
                            ),
                        );
                        return (
                          <article className="organization-team" key={team.id}>
                            <header>
                              <span className="team-icon"><Users size={17} /></span>
                              <div>
                                <strong>{team.name}</strong>
                                <span>
                                  {team.members.length} {team.members.length === 1 ? "miembro" : "miembros"}
                                </span>
                              </div>
                              {canRemove && (
                                <Tooltip title="Eliminar equipo">
                                  <IconButton
                                    aria-label={`Eliminar ${team.name}`}
                                    onClick={() =>
                                      openRemoval({ kind: "team", id: team.id, name: team.name })
                                    }
                                    disabled={isSubmitting}
                                  >
                                    <Trash2 size={16} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </header>
                            <div className="team-member-list">
                              {team.members.length === 0 ? (
                                <p>Este equipo todavía no tiene miembros.</p>
                              ) : (
                                team.members.map((teamMember) => (
                                  <div key={teamMember.membership.user.id}>
                                    <span className="profile-initial">
                                      {teamMember.membership.user.displayName.charAt(0).toUpperCase()}
                                    </span>
                                    <span>
                                      <strong>{teamMember.membership.user.displayName}</strong>
                                      <small>{teamMember.membership.user.email}</small>
                                    </span>
                                    {canRemove && (
                                      <Tooltip title="Retirar del equipo">
                                        <IconButton
                                          aria-label={`Retirar a ${teamMember.membership.user.displayName} de ${team.name}`}
                                          onClick={() =>
                                            openRemoval({
                                              kind: "teamMember",
                                              id: teamMember.membership.user.id,
                                              teamId: team.id,
                                              name: teamMember.membership.user.displayName,
                                            })
                                          }
                                        >
                                          <X size={15} />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                            {canManage && (
                              <Button
                                size="small"
                                startIcon={<UserPlus size={15} />}
                                disabled={availableMembers.length === 0}
                                onClick={() => {
                                  setTeamForMember(team);
                                  setTeamMemberEmail(availableMembers[0]?.user.email ?? "");
                                }}
                              >
                                {availableMembers.length === 0
                                  ? "Todos asignados"
                                  : "Asignar miembro"}
                              </Button>
                            )}
                          </article>
                        );
                      })
                    )}
                  </div>
                </section>}
              </div>
            </section>
          )}
        </div>
      )}
      <Dialog
        open={organizationDialog === "create"}
        onClose={() => !isSubmitting && setOrganizationDialog(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="create-organization-title"
      >
        <form
          onSubmit={(event) =>
            void submit(
              event,
              "",
              { name: organizationName },
              () => {
                setOrganizationName("");
                setOrganizationDialog(null);
              },
              "Organización creada.",
            )
          }
        >
          <DialogTitle id="create-organization-title">Nueva organización</DialogTitle>
          <DialogContent className="organization-dialog-content">
            <p>Crea un espacio independiente para sus miembros, equipos y accesos.</p>
            <TextField
              label="Nombre de la organización"
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              required
              fullWidth
              autoFocus
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOrganizationDialog(null)} disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting}>
              {isSubmitting ? "Creando..." : "Crear organización"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={organizationDialog === "member"}
        onClose={() => !isSubmitting && setOrganizationDialog(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="add-organization-member-title"
      >
        <form
          onSubmit={(event) =>
            selectedOrganization &&
            void submit(
              event,
              `/${selectedOrganization.id}/members`,
              { email: memberEmail, role: memberRole },
              () => {
                setMemberEmail("");
                setMemberRole("MEMBER");
                setOrganizationDialog(null);
              },
              "Miembro agregado.",
            )
          }
        >
          <DialogTitle id="add-organization-member-title">Agregar miembro</DialogTitle>
          <DialogContent className="organization-dialog-content">
            <p>El usuario debe estar activo en PassNexus.</p>
            <TextField
              label="Correo del usuario"
              type="email"
              value={memberEmail}
              onChange={(event) => setMemberEmail(event.target.value)}
              required
              fullWidth
              autoFocus
            />
            <TextField
              select
              label="Rol en la organización"
              value={memberRole}
              onChange={(event) =>
                setMemberRole(event.target.value as "ADMIN" | "MEMBER")
              }
              fullWidth
            >
              <MenuItem value="MEMBER">Miembro</MenuItem>
              <MenuItem value="ADMIN">Administrador</MenuItem>
            </TextField>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOrganizationDialog(null)} disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting}>
              {isSubmitting ? "Agregando..." : "Agregar miembro"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={organizationDialog === "team"}
        onClose={() => !isSubmitting && setOrganizationDialog(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="create-organization-team-title"
      >
        <form
          onSubmit={(event) =>
            selectedOrganization &&
            void submit(
              event,
              `/${selectedOrganization.id}/teams`,
              { name: teamName },
              () => {
                setTeamName("");
                setOrganizationDialog(null);
              },
              "Equipo creado.",
            )
          }
        >
          <DialogTitle id="create-organization-team-title">Crear equipo</DialogTitle>
          <DialogContent className="organization-dialog-content">
            <p>Usa un nombre reconocible para compartir con el grupo correcto.</p>
            <TextField
              label="Nombre del equipo"
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              required
              fullWidth
              autoFocus
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOrganizationDialog(null)} disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting}>
              {isSubmitting ? "Creando..." : "Crear equipo"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(teamForMember)}
        onClose={() => !isSubmitting && setTeamForMember(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="assign-team-member-title"
      >
        <form
          onSubmit={(event) =>
            selectedOrganization &&
            teamForMember &&
            void submit(
              event,
              `/${selectedOrganization.id}/teams/${teamForMember.id}/members`,
              { email: teamMemberEmail },
              () => {
                setTeamMemberEmail("");
                setTeamForMember(null);
              },
              "Miembro asignado al equipo.",
            )
          }
        >
          <DialogTitle id="assign-team-member-title">Asignar a {teamForMember?.name}</DialogTitle>
          <DialogContent className="organization-dialog-content">
            <p>Selecciona una persona que ya pertenezca a la organización.</p>
            <TextField
              select
              label="Miembro"
              value={teamMemberEmail}
              onChange={(event) => setTeamMemberEmail(event.target.value)}
              required
              fullWidth
            >
              {selectedOrganization?.members
                .filter(
                  (member) =>
                    !teamForMember?.members.some(
                      (teamMember) =>
                        teamMember.membership.user.id === member.user.id,
                    ),
                )
                .map((member) => (
                  <MenuItem key={member.user.id} value={member.user.email}>
                    {member.user.displayName} · {member.user.email}
                  </MenuItem>
                ))}
            </TextField>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTeamForMember(null)} disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting || !teamMemberEmail}>
              {isSubmitting ? "Asignando..." : "Asignar miembro"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(pendingRemoval)}
        onClose={() => !isSubmitting && closeRemoval()}
        fullWidth
        maxWidth="xs"
        aria-labelledby="organization-removal-title"
      >
        <DialogTitle id="organization-removal-title">
          {pendingRemoval?.kind === "organization"
            ? "Eliminar organización"
            : pendingRemoval?.kind === "team"
              ? "Eliminar equipo"
              : "Quitar miembro"}
        </DialogTitle>
        <DialogContent className="organization-dialog-content">
          <p className="delete-dialog-copy">
            {pendingRemoval?.kind === "organization" ? (
              <>
                Eliminarás <strong>{pendingRemoval.name}</strong>, todos sus
                equipos y los accesos compartidos asociados.
              </>
            ) : pendingRemoval?.kind === "member" ? (
              <>
                Quitarás a <strong>{pendingRemoval.name}</strong> de esta
                organización y sus equipos.
              </>
            ) : pendingRemoval?.kind === "teamMember" ? (
              <>
                Retirarás a <strong>{pendingRemoval.name}</strong> de este equipo.
              </>
            ) : (
              <>
                Eliminarás el equipo <strong>{pendingRemoval?.name}</strong> y
                sus asignaciones.
              </>
            )}{" "}
            Esta acción no se puede deshacer.
          </p>
          {pendingRemoval?.kind === "organization" && (
            <TextField
              label={`Escribe ${pendingRemoval.name} para confirmar`}
              value={deletionConfirmation}
              onChange={(event) => setDeletionConfirmation(event.target.value)}
              fullWidth
              autoFocus
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={closeRemoval}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            className="confirm-delete-button"
            variant="contained"
            onClick={() => void removePendingItem()}
            disabled={
              isSubmitting ||
              (pendingRemoval?.kind === "organization" &&
                deletionConfirmation !== pendingRemoval.name)
            }
          >
            {isSubmitting ? "Eliminando..." : "Eliminar"}
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}

function AdminPanel({
  accessToken,
  section,
  permissions,
  onNavigationChanged,
}: {
  accessToken: string;
  section: string;
  permissions: string[];
  onNavigationChanged: () => Promise<void>;
}) {
  const [records, setRecords] = useState<
    AdminUser[] | AdminRole[] | AdminMenuItem[] | AuditEvent[]
  >([]);
  const [loadedSection, setLoadedSection] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [permissionCatalog, setPermissionCatalog] = useState<AdminPermission[]>(
    [],
  );
  const endpointBySection: Record<string, string> = {
    users: "users",
    roles: "roles",
    navigation: "navigation",
    audit: "audit",
  };

  useEffect(() => {
    const endpoint = endpointBySection[section];
    if (!endpoint) return;
    const controller = new AbortController();
    setLoadedSection(null);
    setIsLoading(true);
    setError("");
    void fetch(`${apiUrl}/admin/${endpoint}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as
          AdminUser[] | AdminRole[] | AdminMenuItem[] | AuditEvent[];
        if (!response.ok)
          throw new Error(
            await getApiMessage(
              response,
              "No fue posible cargar la administración.",
            ),
          );
        setRecords(payload);
        setLoadedSection(section);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError")
          return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No fue posible cargar la administración.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, section]);

  useEffect(() => {
    if (section !== "roles" && section !== "navigation") return;
    const controller = new AbortController();
    const permissionEndpoint =
      section === "roles" ? "permissions" : "navigation/permissions";
    void fetch(`${apiUrl}/admin/${permissionEndpoint}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            await getApiMessage(
              response,
              "No fue posible cargar los permisos.",
            ),
          );
        setPermissionCatalog((await response.json()) as AdminPermission[]);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError")
          return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No fue posible cargar los permisos.",
        );
      });
    return () => controller.abort();
  }, [accessToken, section]);

  const visibleRecords = loadedSection === section ? records : [];

  async function save(id: string, endpoint: string, body: object) {
    setError("");
    setMessage("");
    setIsSaving(id);
    try {
      const response = await fetch(`${apiUrl}/admin/${endpoint}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as
        (AdminUser | AdminRole | AdminMenuItem) & { message?: string };
      if (!response.ok)
        throw new Error(
          payload.message ?? "No fue posible guardar los cambios.",
        );
      setRecords(
        (current) =>
          current.map((record) =>
            record.id === id ? payload : record,
          ) as typeof current,
      );
      setMessage("Cambios guardados.");
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No fue posible guardar los cambios.",
      );
      return false;
    } finally {
      setIsSaving(null);
    }
  }

  async function createUser(input: {
    displayName: string;
    email: string;
    roleCodes: string[];
  }) {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/admin/users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      const payload = (await response.json()) as AdminUser & {
        setupUrl?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(payload.message ?? "No fue posible crear el usuario.");
      if (!payload.setupUrl)
        throw new Error("El servidor no generó el enlace de acceso.");
      const { setupUrl, ...user } = payload;
      setRecords((current) => [user, ...(current as AdminUser[])]);
      setMessage(`Usuario ${user.email} creado.`);
      return setupUrl;
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "No fue posible crear el usuario.",
      );
      return null;
    }
  }

  async function createRole(input: CreateRoleInput) {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/admin/roles`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      const payload = (await response.json()) as AdminRole & {
        message?: string;
      };
      if (!response.ok)
        throw new Error(payload.message ?? "No fue posible crear el rol.");
      setRecords(
        (current) =>
          [...(current as AdminRole[]), payload].sort((left, right) =>
            left.name.localeCompare(right.name, "es"),
          ) as typeof current,
      );
      setMessage(`Rol ${payload.name} creado.`);
      return payload;
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "No fue posible crear el rol.",
      );
      return null;
    }
  }

  async function createMenuItem(input: MenuItemInput) {
    setError("");
    setMessage("");
    setIsSaving("navigation-create");
    try {
      const response = await fetch(`${apiUrl}/admin/navigation`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      const payload = (await response.json()) as AdminMenuItem & {
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.message ?? "No fue posible crear el elemento.",
        );
      setRecords(
        (current) => [...(current as AdminMenuItem[]), payload] as typeof current,
      );
      await onNavigationChanged();
      setMessage(`${payload.label} se añadió a la navegación.`);
      return payload;
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "No fue posible crear el elemento.",
      );
      return null;
    } finally {
      setIsSaving(null);
    }
  }

  async function deleteMenuItem(item: AdminMenuItem) {
    setError("");
    setMessage("");
    setIsSaving(item.id);
    try {
      const response = await fetch(`${apiUrl}/admin/navigation/${item.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok)
        throw new Error(
          await getApiMessage(response, "No fue posible eliminar el elemento."),
        );
      setRecords((current) => {
        const menuItems = current as AdminMenuItem[];
        const removedIds = new Set([item.id]);
        let foundChild = true;
        while (foundChild) {
          foundChild = false;
          for (const candidate of menuItems) {
            if (
              candidate.parentId &&
              removedIds.has(candidate.parentId) &&
              !removedIds.has(candidate.id)
            ) {
              removedIds.add(candidate.id);
              foundChild = true;
            }
          }
        }
        return menuItems.filter((candidate) => !removedIds.has(candidate.id));
      });
      await onNavigationChanged();
      setMessage(`${item.label} se eliminó de la navegación.`);
      return true;
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No fue posible eliminar el elemento.",
      );
      return false;
    } finally {
      setIsSaving(null);
    }
  }

  async function generateSetupLink(user: AdminUser) {
    setError("");
    setMessage("");
    setIsSaving(user.id);
    try {
      const response = await fetch(
        `${apiUrl}/admin/users/${user.id}/setup-link`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const payload = (await response.json()) as {
        setupUrl?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(payload.message ?? "No fue posible generar el enlace.");
      if (!payload.setupUrl)
        throw new Error("El servidor no generó el enlace de acceso.");
      setMessage(`Enlace de acceso generado para ${user.email}.`);
      return payload.setupUrl;
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "No fue posible generar el enlace.",
      );
      return null;
    } finally {
      setIsSaving(null);
    }
  }

  async function generateTemporaryPassword(user: AdminUser) {
    setError("");
    setMessage("");
    setIsSaving(user.id);
    try {
      const response = await fetch(
        `${apiUrl}/admin/users/${user.id}/temporary-password`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const payload = (await response.json()) as {
        temporaryPassword?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.message ?? "No fue posible generar la contraseña temporal.",
        );
      if (!payload.temporaryPassword)
        throw new Error("El servidor no generó la contraseña temporal.");
      setRecords(
        (current) =>
          current.map((record) =>
            record.id === user.id ? { ...record, status: "ACTIVE" } : record,
          ) as typeof current,
      );
      setMessage(`Contraseña temporal generada para ${user.email}.`);
      return payload.temporaryPassword;
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "No fue posible generar la contraseña temporal.",
      );
      return null;
    } finally {
      setIsSaving(null);
    }
  }

  if (isLoading)
    return (
      <section className="admin-panel" aria-label="Cargando administración">
        <LinearProgress />
      </section>
    );

  if (section === "users")
    return (
      <UsersAdmin
        accessToken={accessToken}
        canCreate={permissions.includes("users.create")}
        canUpdate={permissions.includes("users.update")}
        records={visibleRecords as AdminUser[]}
        error={error}
        message={message}
        isSaving={isSaving}
        onCreate={createUser}
        onGenerateSetupLink={generateSetupLink}
        onGenerateTemporaryPassword={generateTemporaryPassword}
        onSave={(user) =>
          save(user.id, `users/${user.id}`, {
            status: user.status,
            roleCodes: user.roles.map(({ role }) => role.code),
          })
        }
      />
    );
  if (section === "roles")
    return (
      <RolesAdmin
        records={visibleRecords as AdminRole[]}
        permissions={permissionCatalog}
        canCreate={permissions.includes("roles.create")}
        canUpdate={permissions.includes("roles.update")}
        error={error}
        message={message}
        isSaving={isSaving}
        onCreate={createRole}
        onSave={(role, permissionCodes) =>
          save(role.id, `roles/${role.id}/permissions`, {
            permissionCodes,
          })
        }
      />
    );
  if (section === "navigation")
    return (
      <NavigationAdmin
        records={visibleRecords as AdminMenuItem[]}
        error={error}
        message={message}
        isSaving={isSaving}
        permissions={permissionCatalog}
        canUpdate={permissions.includes("navigation.update")}
        onCreate={createMenuItem}
        onDelete={deleteMenuItem}
        onSave={async (item, input) => {
          const saved = await save(item.id, `navigation/${item.id}`, {
            label: input.label,
            path: input.path,
            icon: input.icon,
            type: input.type,
            sortOrder: input.sortOrder,
            isVisible: input.isVisible,
            parentId: input.parentId,
            permissionCode: input.permissionCode,
          });
          if (saved) await onNavigationChanged();
          return saved;
        }}
      />
    );
  return <AuditAdmin records={visibleRecords as AuditEvent[]} error={error} />;
}

function UsersAdmin({
  accessToken,
  canCreate,
  canUpdate,
  records,
  error,
  message,
  isSaving,
  onCreate,
  onGenerateSetupLink,
  onGenerateTemporaryPassword,
  onSave,
}: {
  accessToken: string;
  canCreate: boolean;
  canUpdate: boolean;
  records: AdminUser[];
  error: string;
  message: string;
  isSaving: string | null;
  onCreate: (input: {
    displayName: string;
    email: string;
    roleCodes: string[];
  }) => Promise<string | null>;
  onGenerateSetupLink: (user: AdminUser) => Promise<string | null>;
  onGenerateTemporaryPassword: (user: AdminUser) => Promise<string | null>;
  onSave: (user: AdminUser) => Promise<boolean>;
}) {
  const [roleOptions, setRoleOptions] = useState<AdminRoleOption[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedRoleCodes, setSelectedRoleCodes] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupLink, setSetupLink] = useState<{ email: string; url: string } | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<{ email: string; value: string } | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isPasswordCopied, setIsPasswordCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const formatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${apiUrl}/admin/users/role-options`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as AdminRoleOption[];
        if (response.ok) setRoleOptions(payload);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [accessToken]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleUsers = records.filter((user) => {
    if (statusFilter !== "all" && user.status !== statusFilter) return false;
    if (
      roleFilter !== "all" &&
      !user.roles.some(({ role }) => role.code === roleFilter)
    )
      return false;
    return (
      !normalizedQuery ||
      user.displayName.toLocaleLowerCase().includes(normalizedQuery) ||
      user.email.toLocaleLowerCase().includes(normalizedQuery)
    );
  });
  const activeCount = records.filter((user) => user.status === "ACTIVE").length;
  const pendingCount = records.filter(
    (user) => user.status === "PENDING_VERIFICATION",
  ).length;
  const suspendedCount = records.filter(
    (user) => user.status === "SUSPENDED",
  ).length;

  function toggleRole(code: string) {
    setSelectedRoleCodes((current) =>
      current.includes(code)
        ? current.filter((currentCode) => currentCode !== code)
        : [...current, code],
    );
  }

  function openCreateUser() {
    setDisplayName("");
    setEmail("");
    setSelectedRoleCodes(
      roleOptions.some((role) => role.code === "MEMBER") ? ["MEMBER"] : [],
    );
    setCreateUserOpen(true);
  }

  function openEditor(user: AdminUser) {
    setEditingUser(structuredClone(user));
    setSelectedRoleCodes(user.roles.map(({ role }) => role.code));
  }

  async function submitCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const setupUrl = await onCreate({ displayName, email, roleCodes: selectedRoleCodes });
    setIsSubmitting(false);
    if (setupUrl) {
      setCreateUserOpen(false);
      setSetupLink({ email, url: setupUrl });
      setIsCopied(false);
      setCopyError("");
    }
  }

  async function showNewSetupLink(user: AdminUser) {
    const setupUrl = await onGenerateSetupLink(user);
    if (!setupUrl) return;
    setSetupLink({ email: user.email, url: setupUrl });
    setIsCopied(false);
    setCopyError("");
  }

  async function copySetupLink() {
    if (!setupLink) return;
    try {
      await navigator.clipboard.writeText(setupLink.url);
      setIsCopied(true);
      setCopyError("");
    } catch {
      setCopyError("No se pudo copiar automáticamente. Selecciona el enlace y cópialo manualmente.");
    }
  }

  async function showTemporaryPassword(user: AdminUser) {
    const value = await onGenerateTemporaryPassword(user);
    if (!value) return;
    setTemporaryPassword({ email: user.email, value });
    setIsPasswordCopied(false);
    setCopyError("");
  }

  async function copyTemporaryPassword() {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword.value);
      setIsPasswordCopied(true);
      setCopyError("");
    } catch {
      setCopyError("No se pudo copiar automáticamente. Selecciona la contraseña y cópiala manualmente.");
    }
  }

  async function submitEdit() {
    if (!editingUser) return;
    setIsSubmitting(true);
    const succeeded = await onSave({
      ...editingUser,
      roles: selectedRoleCodes.map((code) => ({
        role: roleOptions.find((role) => role.code === code) ?? {
          code,
          name: code,
          description: null,
        },
      })),
    });
    setIsSubmitting(false);
    if (succeeded) setEditingUser(null);
  }

  const statusLabel: Record<AdminUser["status"], string> = {
    ACTIVE: "Activo",
    PENDING_VERIFICATION: "Acceso pendiente",
    SUSPENDED: "Suspendido",
  };

  return (
    <section className="users-panel">
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      <header className="users-overview">
        <div>
          <p className="section-label">CONTROL DE ACCESO</p>
          <h2>Directorio de usuarios</h2>
          <p>Crea usuarios internos y controla su acceso a PassNexus.</p>
        </div>
        {canCreate && (
          <Button variant="contained" startIcon={<UserPlus size={18} />} onClick={openCreateUser}>
            Crear usuario
          </Button>
        )}
      </header>
      <div className="users-summary" aria-label="Resumen de usuarios">
        <span><strong>{records.length}</strong> Total</span>
        <span className="active"><strong>{activeCount}</strong> Activos</span>
        <span className="pending"><strong>{pendingCount}</strong> Pendientes</span>
        <span className="suspended"><strong>{suspendedCount}</strong> Suspendidos</span>
      </div>
      <div className="users-toolbar">
        <TextField
          className="users-search"
          size="small"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre o correo"
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={17} /></InputAdornment> } }}
        />
        <TextField select size="small" label="Estado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <MenuItem value="all">Todos</MenuItem>
          <MenuItem value="ACTIVE">Activos</MenuItem>
          <MenuItem value="PENDING_VERIFICATION">Pendientes</MenuItem>
          <MenuItem value="SUSPENDED">Suspendidos</MenuItem>
        </TextField>
        <TextField select size="small" label="Rol" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
          <MenuItem value="all">Todos</MenuItem>
          {roleOptions.map((role) => <MenuItem key={role.code} value={role.code}>{role.name}</MenuItem>)}
        </TextField>
      </div>
      <div className="users-table-shell">
        <table className="users-table">
          <thead><tr><th>Usuario</th><th>Estado</th><th>Roles</th><th>Alta</th><th><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>
            {visibleUsers.map((user) => (
              <tr key={user.id}>
                <td><span className="user-avatar">{user.displayName.charAt(0).toUpperCase()}</span><div><strong>{user.displayName}</strong><span>{user.email}</span></div></td>
                <td><span className={`user-status ${user.status.toLocaleLowerCase()}`}>{statusLabel[user.status]}</span></td>
                <td><div className="user-role-list">{user.roles.length ? user.roles.map(({ role }) => <span key={role.code}>{role.name}</span>) : <em>Sin roles</em>}</div></td>
                <td><time dateTime={user.createdAt}>{formatter.format(new Date(user.createdAt))}</time></td>
                <td><div className="user-row-actions">
                  {canUpdate && <>
                  {user.status === "PENDING_VERIFICATION" && <Tooltip title="Generar nuevo enlace"><span><IconButton aria-label={`Generar enlace de acceso para ${user.email}`} disabled={isSaving === user.id} onClick={() => void showNewSetupLink(user)}><Link2 size={17} /></IconButton></span></Tooltip>}
                  {user.status !== "SUSPENDED" && <Tooltip title="Generar contraseña temporal"><span><IconButton aria-label={`Generar contraseña temporal para ${user.email}`} disabled={isSaving === user.id} onClick={() => void showTemporaryPassword(user)}><RotateCcw size={17} /></IconButton></span></Tooltip>}
                  <Tooltip title="Editar acceso"><IconButton aria-label={`Editar acceso de ${user.displayName}`} onClick={() => openEditor(user)}><Pencil size={17} /></IconButton></Tooltip>
                  </>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!error && visibleUsers.length === 0 && <div className="users-empty"><Users size={22} /><div><strong>No hay usuarios que coincidan</strong><span>Ajusta la búsqueda o los filtros.</span></div></div>}

      <Dialog open={createUserOpen} onClose={() => !isSubmitting && setCreateUserOpen(false)} fullWidth maxWidth="sm">
        <form onSubmit={(event) => void submitCreateUser(event)}>
          <DialogTitle>Crear usuario</DialogTitle>
          <DialogContent className="user-dialog-content">
            <p>No se enviará ningún correo. Al crear el usuario podrás copiar su enlace de acceso.</p>
            <TextField label="Nombre completo" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required fullWidth />
            <TextField label="Correo electrónico" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required fullWidth />
            <RoleSelector roles={roleOptions} selected={selectedRoleCodes} onToggle={toggleRole} />
          </DialogContent>
          <DialogActions><Button onClick={() => setCreateUserOpen(false)} disabled={isSubmitting}>Cancelar</Button><Button type="submit" variant="contained" disabled={isSubmitting}>{isSubmitting ? "Creando..." : "Crear usuario"}</Button></DialogActions>
        </form>
      </Dialog>

      <Dialog open={Boolean(setupLink)} onClose={() => setSetupLink(null)} fullWidth maxWidth="sm">
        <DialogTitle>Enlace de acceso</DialogTitle>
        <DialogContent className="user-dialog-content">
          <p>Comparte este enlace con <strong>{setupLink?.email}</strong> para que establezca su contraseña.</p>
          <TextField
            className="setup-link-field"
            label="Enlace de configuración"
            value={setupLink?.url ?? ""}
            slotProps={{ input: { readOnly: true } }}
            fullWidth
          />
          <Alert severity="warning">El enlace es de un solo uso. Generar otro invalidará el anterior.</Alert>
          {copyError && <Alert severity="error">{copyError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSetupLink(null)}>Cerrar</Button>
          <Button variant="contained" startIcon={isCopied ? <Check size={17} /> : <Copy size={17} />} onClick={() => void copySetupLink()}>
            {isCopied ? "Copiado" : "Copiar enlace"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(temporaryPassword)} onClose={() => setTemporaryPassword(null)} fullWidth maxWidth="sm">
        <DialogTitle>Contraseña temporal</DialogTitle>
        <DialogContent className="user-dialog-content">
          <p>Entrega esta contraseña a <strong>{temporaryPassword?.email}</strong> para que pueda iniciar sesión.</p>
          <TextField
            className="setup-link-field"
            label="Contraseña temporal"
            value={temporaryPassword?.value ?? ""}
            slotProps={{ input: { readOnly: true } }}
            fullWidth
          />
          <Alert severity="warning">Se muestra una sola vez y reemplaza la contraseña anterior. Las sesiones abiertas y los enlaces anteriores quedan invalidados.</Alert>
          {copyError && <Alert severity="error">{copyError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemporaryPassword(null)}>Cerrar</Button>
          <Button variant="contained" startIcon={isPasswordCopied ? <Check size={17} /> : <Copy size={17} />} onClick={() => void copyTemporaryPassword()}>
            {isPasswordCopied ? "Copiada" : "Copiar contraseña"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editingUser)} onClose={() => !isSubmitting && setEditingUser(null)} fullWidth maxWidth="sm">
        <DialogTitle>Editar acceso</DialogTitle>
        <DialogContent className="user-dialog-content">
          <div className="user-dialog-identity"><span className="user-avatar">{editingUser?.displayName.charAt(0).toUpperCase()}</span><div><strong>{editingUser?.displayName}</strong><span>{editingUser?.email}</span></div></div>
          <TextField select label="Estado de la cuenta" value={editingUser?.status ?? "ACTIVE"} onChange={(event) => setEditingUser((current) => current ? { ...current, status: event.target.value as AdminUser["status"] } : current)} fullWidth>
            <MenuItem value="PENDING_VERIFICATION">Invitación pendiente</MenuItem><MenuItem value="ACTIVE">Activo</MenuItem><MenuItem value="SUSPENDED">Suspendido</MenuItem>
          </TextField>
          <RoleSelector roles={roleOptions} selected={selectedRoleCodes} onToggle={toggleRole} />
        </DialogContent>
        <DialogActions><Button onClick={() => setEditingUser(null)} disabled={isSubmitting}>Cancelar</Button><Button variant="contained" onClick={() => void submitEdit()} disabled={isSubmitting}>{isSubmitting ? "Guardando..." : "Guardar cambios"}</Button></DialogActions>
      </Dialog>
    </section>
  );
}

function RoleSelector({ roles, selected, onToggle }: { roles: AdminRoleOption[]; selected: string[]; onToggle: (code: string) => void }) {
  return (
    <fieldset className="role-selector">
      <legend>Roles de acceso</legend>
      {roles.map((role) => (
        <label key={role.code}>
          <Checkbox checked={selected.includes(role.code)} onChange={() => onToggle(role.code)} />
          <span><strong>{role.name}</strong><small>{role.description ?? "Sin descripción"}</small></span>
        </label>
      ))}
    </fieldset>
  );
}

function RolesAdmin({
  records,
  permissions,
  canCreate,
  canUpdate,
  error,
  message,
  isSaving,
  onCreate,
  onSave,
}: {
  records: AdminRole[];
  permissions: AdminPermission[];
  canCreate: boolean;
  canUpdate: boolean;
  error: string;
  message: string;
  isSaving: string | null;
  onCreate: (input: CreateRoleInput) => Promise<AdminRole | null>;
  onSave: (role: AdminRole, permissions: string[]) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleCode, setNewRoleCode] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);
  const [roleCodeEdited, setRoleCodeEdited] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  useEffect(
    () =>
      setSelected(
        Object.fromEntries(
          records.map((role) => [
            role.id,
            role.permissions.map(({ permission }) => permission.code),
          ]),
        ),
      ),
    [records],
  );
  useEffect(() => {
    if (!records.some((role) => role.id === selectedRoleId))
      setSelectedRoleId(records[0]?.id ?? "");
  }, [records, selectedRoleId]);

  const selectedRole = records.find((role) => role.id === selectedRoleId);
  const moduleLabels: Record<string, string> = {
    vault: "Vault",
    organizations: "Organizaciones",
    users: "Usuarios",
    roles: "Roles y permisos",
    navigation: "Navegación",
    audit: "Auditoría",
  };
  const actionLabels: Record<string, string> = {
    read: "Ver",
    create: "Crear",
    update: "Editar",
    delete: "Eliminar",
  };
  const moduleOrder = [
    "vault",
    "organizations",
    "users",
    "roles",
    "navigation",
    "audit",
  ];
  const groupedPermissions = moduleOrder.map((module) => ({
    module,
    permissions: permissions.filter((permission) =>
      permission.code.startsWith(`${module}.`),
    ),
  }));
  const activeCodes = selectedRole ? selected[selectedRole.id] ?? [] : [];
  const savedCodes =
    selectedRole?.permissions.map(({ permission }) => permission.code) ?? [];
  const hasChanges =
    activeCodes.length !== savedCodes.length ||
    activeCodes.some((code) => !savedCodes.includes(code));

  function togglePermission(code: string) {
    if (!selectedRole || !canUpdate) return;
    setSelected((current) => ({
      ...current,
      [selectedRole.id]: (current[selectedRole.id] ?? []).includes(code)
        ? (current[selectedRole.id] ?? []).filter(
            (currentCode) => currentCode !== code,
          )
        : [...(current[selectedRole.id] ?? []), code],
    }));
  }

  function normalizeRoleCode(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function closeCreateRole() {
    if (isCreating) return;
    setCreateRoleOpen(false);
    setNewRoleName("");
    setNewRoleCode("");
    setNewRoleDescription("");
    setNewRolePermissions([]);
    setRoleCodeEdited(false);
  }

  async function submitNewRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    const role = await onCreate({
      code: newRoleCode,
      name: newRoleName,
      description: newRoleDescription,
      permissionCodes: newRolePermissions,
    });
    setIsCreating(false);
    if (!role) return;
    setSelectedRoleId(role.id);
    setCreateRoleOpen(false);
    setNewRoleName("");
    setNewRoleCode("");
    setNewRoleDescription("");
    setNewRolePermissions([]);
    setRoleCodeEdited(false);
  }

  return (
    <section className="roles-panel">
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      <header className="roles-overview">
        <div>
          <p className="section-label">POLÍTICAS DE ACCESO</p>
          <h2>Roles y permisos</h2>
          <p>Define qué puede consultar y modificar cada perfil en PassNexus.</p>
        </div>
        <div className="roles-overview-actions">
          {canCreate && (
            <Button
              variant="contained"
              startIcon={<Plus size={17} />}
              onClick={() => setCreateRoleOpen(true)}
            >
              Crear rol
            </Button>
          )}
          <div className="roles-totals">
            <strong>{records.length}</strong>
            <span>roles configurados</span>
          </div>
        </div>
      </header>
      {selectedRole && (
        <div className="roles-workspace">
          <aside className="role-directory" aria-label="Roles disponibles">
            <span className="role-directory-label">Selecciona un rol</span>
            {records.map((role) => (
              <button
                key={role.id}
                className={role.id === selectedRole.id ? "selected" : ""}
                onClick={() => setSelectedRoleId(role.id)}
              >
                <span className="role-symbol"><ShieldCheck size={17} /></span>
                <span><strong>{role.name}</strong><small>{role._count.users} usuarios</small></span>
                <ChevronRight size={16} />
              </button>
            ))}
          </aside>
          <div className="permission-workspace">
            <header className="permission-heading">
              <div>
                <span className="role-code">{selectedRole.code}</span>
                <h3>{selectedRole.name}</h3>
                <p>{selectedRole.description ?? "Sin descripción."}</p>
              </div>
              {canUpdate ? (
                <Button
                  variant="contained"
                  startIcon={<Save size={17} />}
                  onClick={() => void onSave(selectedRole, activeCodes)}
                  disabled={!hasChanges || isSaving === selectedRole.id}
                >
                  {isSaving === selectedRole.id ? "Guardando..." : "Guardar cambios"}
                </Button>
              ) : (
                <span className="read-only-badge"><Eye size={15} /> Solo consulta</span>
              )}
            </header>
            <div className="permission-matrix" role="table" aria-label={`Permisos de ${selectedRole.name}`}>
              <div className="permission-matrix-head" role="row">
                <span role="columnheader">Módulo</span>
                {["read", "create", "update", "delete"].map((action) => (
                  <span key={action} role="columnheader">{actionLabels[action]}</span>
                ))}
              </div>
              {groupedPermissions.map((group) => (
                <div className="permission-matrix-row" role="row" key={group.module}>
                  <span className="permission-module" role="rowheader">
                    <strong>{moduleLabels[group.module]}</strong>
                    <small>{group.permissions.filter((permission) => activeCodes.includes(permission.code)).length} de {group.permissions.length} activos</small>
                  </span>
                  {["read", "create", "update", "delete"].map((action) => {
                    const permission = group.permissions.find(
                      (candidate) => candidate.code === `${group.module}.${action}`,
                    );
                    return (
                      <span className="permission-cell" role="cell" key={action}>
                        {permission ? (
                          <Tooltip title={permission.description ?? permission.name}>
                            <Checkbox
                              slotProps={{ input: { "aria-label": `${actionLabels[action]} ${moduleLabels[group.module]}` } }}
                              checked={activeCodes.includes(permission.code)}
                              disabled={!canUpdate}
                              onChange={() => togglePermission(permission.code)}
                            />
                          </Tooltip>
                        ) : <span className="permission-na">—</span>}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            <footer className="permission-footer">
              <span>{activeCodes.length} permisos activos</span>
              {hasChanges && <span className="unsaved-marker">Cambios sin guardar</span>}
            </footer>
          </div>
        </div>
      )}
      {!error && records.length === 0 && (
        <p className="admin-empty">No hay roles para mostrar.</p>
      )}
      <Dialog
        open={createRoleOpen}
        onClose={closeCreateRole}
        fullWidth
        maxWidth="md"
        aria-labelledby="create-role-title"
      >
        <form className="role-create-form" onSubmit={submitNewRole}>
          <DialogTitle id="create-role-title">Crear rol</DialogTitle>
          <DialogContent className="role-create-dialog">
            <p>
              Define la identidad del rol y sus permisos iniciales. Podrás
              ajustarlos después desde la matriz principal.
            </p>
            <div className="role-create-fields">
              <TextField
                label="Nombre del rol"
                value={newRoleName}
                onChange={(event) => {
                  setNewRoleName(event.target.value);
                  if (!roleCodeEdited)
                    setNewRoleCode(normalizeRoleCode(event.target.value));
                }}
                slotProps={{ htmlInput: { minLength: 2, maxLength: 80 } }}
                required
                autoFocus
              />
              <TextField
                label="Código"
                value={newRoleCode}
                onChange={(event) => {
                  setRoleCodeEdited(true);
                  setNewRoleCode(normalizeRoleCode(event.target.value));
                }}
                helperText="Único, en mayúsculas y sin espacios."
                slotProps={{ htmlInput: { minLength: 2, maxLength: 60 } }}
                required
              />
            </div>
            <TextField
              label="Descripción (opcional)"
              value={newRoleDescription}
              onChange={(event) => setNewRoleDescription(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 240 } }}
              multiline
              minRows={2}
              fullWidth
            />
            <fieldset className="role-create-permissions">
              <legend>Permisos iniciales</legend>
              <p>Selecciona sólo las capacidades necesarias para este perfil.</p>
              <div className="role-create-permission-grid">
                {groupedPermissions.map((group) => (
                  <section key={group.module} className="role-create-module">
                    <strong>{moduleLabels[group.module]}</strong>
                    <div>
                      {group.permissions.map((permission) => {
                        const action = permission.code.split(".")[1];
                        return (
                          <FormControlLabel
                            key={permission.code}
                            control={
                              <Checkbox
                                slotProps={{
                                  input: {
                                    "aria-label": `${actionLabels[action]} ${moduleLabels[group.module]}`,
                                  },
                                }}
                                checked={newRolePermissions.includes(permission.code)}
                                onChange={() =>
                                  setNewRolePermissions((current) =>
                                    current.includes(permission.code)
                                      ? current.filter((code) => code !== permission.code)
                                      : [...current, permission.code],
                                  )
                                }
                              />
                            }
                            label={actionLabels[action] ?? permission.name}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </fieldset>
            {error && <Alert severity="error">{error}</Alert>}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeCreateRole} disabled={isCreating}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={
                isCreating || !newRoleName.trim() || !newRoleCode.trim()
              }
            >
              {isCreating ? "Creando..." : "Crear rol"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </section>
  );
}

function NavigationAdmin({
  records,
  permissions,
  error,
  message,
  isSaving,
  canUpdate,
  onCreate,
  onDelete,
  onSave,
}: {
  records: AdminMenuItem[];
  permissions: AdminPermission[];
  error: string;
  message: string;
  isSaving: string | null;
  canUpdate: boolean;
  onCreate: (input: MenuItemInput) => Promise<AdminMenuItem | null>;
  onDelete: (item: AdminMenuItem) => Promise<boolean>;
  onSave: (item: AdminMenuItem, input: MenuItemInput) => Promise<boolean>;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminMenuItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<AdminMenuItem | null>(null);
  const [draft, setDraft] = useState<MenuItemInput>({
    key: "",
    label: "",
    path: "",
    icon: "PanelLeft",
    type: "PAGE",
    sortOrder: 10,
    isVisible: true,
    parentId: null,
    permissionCode: null,
  });
  const typeLabels: Record<AdminMenuItem["type"], string> = {
    PAGE: "Página interna",
    GROUP: "Grupo",
    EXTERNAL_LINK: "Enlace externo",
  };
  const recordIds = new Set(records.map((item) => item.id));
  const visited = new Set<string>();
  const rows: { item: AdminMenuItem; depth: number }[] = [];

  function appendChildren(parentId: string | null, depth: number) {
    records
      .filter((item) => {
        const effectiveParent =
          item.parentId && recordIds.has(item.parentId) ? item.parentId : null;
        return effectiveParent === parentId && !visited.has(item.id);
      })
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.label.localeCompare(right.label, "es"),
      )
      .forEach((item) => {
        visited.add(item.id);
        rows.push({ item, depth });
        appendChildren(item.id, depth + 1);
      });
  }

  appendChildren(null, 0);
  records
    .filter((item) => !visited.has(item.id))
    .forEach((item) => rows.push({ item, depth: 0 }));

  function getDescendantIds(rootId: string) {
    const ids = new Set([rootId]);
    let foundChild = true;
    while (foundChild) {
      foundChild = false;
      for (const item of records) {
        if (
          item.parentId &&
          ids.has(item.parentId) &&
          !ids.has(item.id)
        ) {
          ids.add(item.id);
          foundChild = true;
        }
      }
    }
    return ids;
  }
  const descendantIds = editingItem
    ? getDescendantIds(editingItem.id)
    : new Set<string>();
  const deleteDescendantCount = itemToDelete
    ? getDescendantIds(itemToDelete.id).size - 1
    : 0;

  function normalizeKey(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function openCreate() {
    setEditingItem(null);
    setDraft({
      key: "",
      label: "",
      path: "",
      icon: "PanelLeft",
      type: "PAGE",
      sortOrder:
        records.length > 0
          ? Math.ceil((Math.max(...records.map((item) => item.sortOrder)) + 1) / 10) * 10
          : 10,
      isVisible: true,
      parentId: null,
      permissionCode: null,
    });
    setEditorOpen(true);
  }

  function openEdit(item: AdminMenuItem) {
    setEditingItem(item);
    setDraft({
      key: item.key,
      label: item.label,
      path: item.path,
      icon: item.icon,
      type: item.type,
      sortOrder: item.sortOrder,
      isVisible: item.isVisible,
      parentId: item.parentId,
      permissionCode: item.permission?.code ?? null,
    });
    setEditorOpen(true);
  }

  function closeEditor() {
    if (isSaving) return;
    setEditorOpen(false);
    setEditingItem(null);
  }

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      ...draft,
      key: normalizeKey(draft.key),
      label: draft.label.trim(),
      path: draft.type === "GROUP" ? null : draft.path?.trim() || null,
      icon: draft.icon || null,
      parentId: draft.parentId || null,
      permissionCode: draft.permissionCode || null,
    };
    const succeeded = editingItem
      ? await onSave(editingItem, input)
      : Boolean(await onCreate(input));
    if (succeeded) closeEditor();
  }

  return (
    <section className="navigation-admin-panel">
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      <header className="navigation-overview">
        <div>
          <p className="section-label">ESTRUCTURA DEL ESPACIO</p>
          <h2>Mapa de navegación</h2>
          <p>Organiza las entradas, rutas y reglas de acceso del menú principal.</p>
        </div>
        <div className="navigation-overview-actions">
          {canUpdate && (
            <Button
              variant="contained"
              startIcon={<Plus size={17} />}
              onClick={openCreate}
            >
              Agregar elemento
            </Button>
          )}
          <div className="navigation-total">
            <strong>{records.length}</strong>
            <span>elementos</span>
          </div>
        </div>
      </header>
      <div className="navigation-summary" aria-label="Resumen de navegación">
        <span><Eye size={16} /><strong>{records.filter((item) => item.isVisible).length}</strong> visibles</span>
        <span><EyeOff size={16} /><strong>{records.filter((item) => !item.isVisible).length}</strong> ocultos</span>
        <span><PanelLeft size={16} /><strong>{records.filter((item) => item.type === "GROUP").length}</strong> grupos</span>
      </div>
      {rows.length > 0 && (
        <div className="navigation-tree" role="tree" aria-label="Elementos del menú">
          <div className="navigation-tree-head" aria-hidden="true">
            <span>Elemento</span><span>Acceso</span><span>Orden</span><span>Estado</span><span />
          </div>
          {rows.map(({ item, depth }) => {
            const ItemIcon = item.icon
              ? (menuIcons[item.icon as keyof typeof menuIcons] ?? PanelLeft)
              : item.type === "EXTERNAL_LINK"
                ? Link2
                : PanelLeft;
            const directChildren = records.filter(
              (candidate) => candidate.parentId === item.id,
            ).length;
            return (
              <article
                className={`navigation-tree-row ${item.isVisible ? "" : "is-hidden"}`}
                key={item.id}
                role="treeitem"
                aria-level={depth + 1}
              >
                <div className="navigation-item-identity">
                  <span
                    className="navigation-depth"
                    style={{ width: `${8 + depth * 22}px` }}
                    aria-hidden="true"
                  />
                  <span className="navigation-item-icon"><ItemIcon size={17} /></span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>
                      {item.key} · {typeLabels[item.type]}
                      {directChildren > 0 ? ` · ${directChildren} hijos` : ""}
                    </small>
                    {item.path && <code>{item.path}</code>}
                  </span>
                </div>
                <span className="navigation-permission">
                  {item.permission?.name ?? "Acceso general"}
                </span>
                <span className="navigation-order">{item.sortOrder}</span>
                <span className={`navigation-status ${item.isVisible ? "visible" : "is-hidden-status"}`}>
                  {item.isVisible ? "Visible" : "Oculto"}
                </span>
                <div className="navigation-row-actions">
                  {canUpdate ? (
                    <>
                      <Tooltip title="Editar elemento">
                        <IconButton
                          aria-label={`Editar ${item.label}`}
                          onClick={() => openEdit(item)}
                        >
                          <Pencil size={16} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar elemento">
                        <IconButton
                          className="navigation-delete-action"
                          aria-label={`Eliminar ${item.label}`}
                          onClick={() => setItemToDelete(item)}
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    </>
                  ) : (
                    <span className="navigation-read-only"><Eye size={14} /> Consulta</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!error && records.length === 0 && (
        <div className="navigation-empty">
          <PanelLeft size={24} />
          <strong>Aún no hay elementos</strong>
          <span>Agrega la primera entrada para construir el menú.</span>
          {canUpdate && <Button onClick={openCreate}>Agregar elemento</Button>}
        </div>
      )}
      <Dialog
        open={editorOpen}
        onClose={closeEditor}
        fullWidth
        maxWidth="md"
        aria-labelledby="navigation-editor-title"
      >
        <form onSubmit={submitItem}>
          <DialogTitle id="navigation-editor-title">
            {editingItem ? "Editar elemento" : "Agregar elemento"}
          </DialogTitle>
          <DialogContent className="navigation-editor-content">
            <p>
              {editingItem
                ? "Ajusta su ubicación, comportamiento y regla de acceso."
                : "Define cómo aparecerá esta entrada dentro del menú principal."}
            </p>
            <div className="navigation-editor-grid">
              <TextField
                label="Etiqueta"
                value={draft.label}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    label: event.target.value,
                    key: editingItem ? current.key : normalizeKey(event.target.value),
                  }))
                }
                required
                autoFocus
              />
              <TextField
                label="Clave técnica"
                value={draft.key}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    key: normalizeKey(event.target.value),
                  }))
                }
                helperText={editingItem ? "La clave no cambia después de crear el elemento." : "Única, en minúsculas y sin espacios."}
                disabled={Boolean(editingItem)}
                required
              />
              <TextField
                select
                label="Tipo"
                value={draft.type}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    type: event.target.value as AdminMenuItem["type"],
                  }))
                }
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <MenuItem key={value} value={value}>{label}</MenuItem>
                ))}
              </TextField>
              <TextField
                label={draft.type === "EXTERNAL_LINK" ? "URL" : "Ruta"}
                value={draft.path ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, path: event.target.value }))
                }
                placeholder={draft.type === "EXTERNAL_LINK" ? "https://..." : "/seccion"}
                disabled={draft.type === "GROUP"}
                required={draft.type !== "GROUP"}
              />
              <TextField
                select
                label="Icono"
                value={draft.icon ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, icon: event.target.value || null }))
                }
              >
                <MenuItem value="">Sin icono</MenuItem>
                {Object.keys(menuIcons).map((icon) => (
                  <MenuItem key={icon} value={icon}>{icon}</MenuItem>
                ))}
              </TextField>
              <TextField
                type="number"
                label="Orden"
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    sortOrder: Number(event.target.value),
                  }))
                }
                slotProps={{ htmlInput: { min: 0, step: 10 } }}
                required
              />
              <TextField
                select
                label="Elemento superior"
                value={draft.parentId ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, parentId: event.target.value || null }))
                }
              >
                <MenuItem value="">Nivel principal</MenuItem>
                {records
                  .filter((item) => !descendantIds.has(item.id))
                  .map((item) => (
                    <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>
                  ))}
              </TextField>
              <TextField
                select
                label="Permiso requerido"
                value={draft.permissionCode ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, permissionCode: event.target.value || null }))
                }
              >
                <MenuItem value="">Sin permiso requerido</MenuItem>
                {permissions.map((permission) => (
                  <MenuItem key={permission.code} value={permission.code}>
                    {permission.name} · {permission.code}
                  </MenuItem>
                ))}
              </TextField>
            </div>
            <FormControlLabel
              className="navigation-visible-control"
              control={
                <Checkbox
                  checked={draft.isVisible}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, isVisible: event.target.checked }))
                  }
                />
              }
              label="Mostrar este elemento en el menú"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={closeEditor} disabled={Boolean(isSaving)}>Cancelar</Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={editingItem ? <Save size={16} /> : <Plus size={16} />}
              disabled={Boolean(isSaving) || !draft.label.trim() || !draft.key.trim()}
            >
              {isSaving ? "Guardando..." : editingItem ? "Guardar cambios" : "Agregar elemento"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(itemToDelete)}
        onClose={() => !isSaving && setItemToDelete(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="delete-navigation-title"
      >
        <DialogTitle id="delete-navigation-title">Eliminar elemento</DialogTitle>
        <DialogContent>
          <p className="delete-dialog-copy">
            Se eliminará <strong>{itemToDelete?.label}</strong> del menú.
            {deleteDescendantCount > 0
              ? ` También se eliminarán sus ${deleteDescendantCount} elementos dependientes.`
              : " Esta acción no se puede deshacer."}
          </p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemToDelete(null)} disabled={Boolean(isSaving)}>Cancelar</Button>
          <Button
            className="confirm-delete-button"
            variant="contained"
            startIcon={<Trash2 size={16} />}
            disabled={!itemToDelete || Boolean(isSaving)}
            onClick={() => {
              if (!itemToDelete) return;
              void onDelete(itemToDelete).then((deleted) => {
                if (deleted) setItemToDelete(null);
              });
            }}
          >
            {isSaving ? "Eliminando..." : "Eliminar"}
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}

function AuditAdmin({
  records,
  error,
}: {
  records: AuditEvent[];
  error: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [actorType, setActorType] = useState("all");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const formatter = new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const categories = Array.from(
    new Set(records.map((event) => event.action.split(/[.-]/)[0])),
  ).sort();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleRecords = records.filter((event) => {
    const eventCategory = event.action.split(/[.-]/)[0];
    if (category !== "all" && eventCategory !== category) return false;
    if (actorType === "users" && !event.user) return false;
    if (actorType === "system" && event.user) return false;
    if (!normalizedQuery) return true;
    return [
      event.action,
      event.entity,
      event.entityId,
      event.user?.displayName,
      event.user?.email,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
  });

  function eventTone(action: string) {
    if (/(deleted|revoked|failed|removed)/i.test(action)) return "critical";
    if (/(auth|session|mfa|password)/i.test(action)) return "security";
    return "change";
  }

  return (
    <section className="audit-panel">
      {error && <Alert severity="error">{error}</Alert>}
      <header className="audit-overview">
        <div>
          <p className="section-label">TRAZABILIDAD</p>
          <h2>Registro de actividad</h2>
          <p>Consulta quién realizó cada cambio y sobre qué recurso.</p>
        </div>
        <span className="audit-total">
          <strong>{visibleRecords.length}</strong>
          {visibleRecords.length === 1 ? "evento" : "eventos"}
        </span>
      </header>
      <div className="audit-toolbar">
        <TextField
          className="audit-search"
          size="small"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por acción, actor o recurso"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={17} />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          select
          size="small"
          label="Categoría"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <MenuItem value="all">Todas</MenuItem>
          {categories.map((value) => (
            <MenuItem key={value} value={value}>
              {value.replace(/[-_]/g, " ")}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Actor"
          value={actorType}
          onChange={(event) => setActorType(event.target.value)}
        >
          <MenuItem value="all">Todos</MenuItem>
          <MenuItem value="users">Usuarios</MenuItem>
          <MenuItem value="system">Sistema</MenuItem>
        </TextField>
      </div>
      {!error && records.length > 0 && (
        <div className="audit-table-shell">
          <table className="audit-table">
            <thead>
              <tr>
                <th scope="col">Acción</th>
                <th scope="col">Recurso</th>
                <th scope="col">Actor</th>
                <th scope="col">Fecha y hora</th>
                <th scope="col"><span className="sr-only">Detalles</span></th>
              </tr>
            </thead>
            <tbody>
              {visibleRecords.map((event) => {
                const isExpanded = expandedEventId === event.id;
                const metadata = Object.entries(event.metadata ?? {});
                return (
                  <Fragment key={event.id}>
                    <tr className={`audit-row ${eventTone(event.action)}`}>
                      <td>
                        <span className="audit-action-marker" />
                        <strong>{event.action.replace(/[._]/g, " ")}</strong>
                      </td>
                      <td>
                        <span>{event.entity}</span>
                        <code title={event.entityId}>{event.entityId}</code>
                      </td>
                      <td>
                        {event.user ? (
                          <>
                            <strong>{event.user.displayName}</strong>
                            <span>{event.user.email}</span>
                          </>
                        ) : (
                          <>
                            <strong>Evento del sistema</strong>
                            <span>Usuario eliminado o sin actor</span>
                          </>
                        )}
                      </td>
                      <td>
                        <time dateTime={event.createdAt}>
                          {formatter.format(new Date(event.createdAt))}
                        </time>
                      </td>
                      <td>
                        <Tooltip title={metadata.length ? "Ver detalles" : "Sin detalles"}>
                          <span>
                            <IconButton
                              aria-label={`${isExpanded ? "Ocultar" : "Ver"} detalles de ${event.action}`}
                              disabled={metadata.length === 0}
                              onClick={() =>
                                setExpandedEventId(isExpanded ? null : event.id)
                              }
                            >
                              <ChevronDown size={17} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="audit-metadata-row">
                        <td colSpan={5}>
                          <dl>
                            {metadata.map(([key, value]) => (
                              <div key={key}>
                                <dt>{key.replace(/[-_]/g, " ")}</dt>
                                <dd>
                                  {Array.isArray(value)
                                    ? value.join(", ")
                                    : String(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!error && records.length > 0 && visibleRecords.length === 0 && (
        <div className="audit-empty">
          <Search size={22} />
            <div>
            <strong>No hay coincidencias</strong>
            <span>Prueba con otros filtros o términos de búsqueda.</span>
            </div>
        </div>
      )}
      {!error && records.length === 0 && (
        <div className="audit-empty">
          <ScrollText size={22} />
          <div>
            <strong>Aún no hay actividad registrada</strong>
            <span>Los próximos cambios aparecerán aquí.</span>
          </div>
        </div>
      )}
    </section>
  );
}

function MenuEntry({
  item,
  activeSection,
  onSelect,
}: {
  item: MenuItem;
  activeSection: string;
  onSelect: (key: string) => void;
}) {
  const Icon = item.icon
    ? (menuIcons[item.icon as keyof typeof menuIcons] ?? PanelLeft)
    : PanelLeft;
  return (
    <div className="menu-entry">
      <a
        className={item.key === activeSection ? "active" : ""}
        href={item.path ?? "#"}
        target={item.type === "EXTERNAL_LINK" ? "_blank" : undefined}
        rel={item.type === "EXTERNAL_LINK" ? "noreferrer" : undefined}
        onClick={(event) => {
          if (item.type === "EXTERNAL_LINK") return;
          event.preventDefault();
          item.type !== "GROUP" && onSelect(item.key);
        }}
      >
        <Icon size={17} />
        <span>{item.label}</span>
      </a>
      {item.children.map((child) => (
        <MenuEntry
          key={child.id}
          item={child}
          activeSection={activeSection}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export default App;
