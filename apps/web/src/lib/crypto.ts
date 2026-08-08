import { argon2id } from "hash-wasm";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type VaultEnvelope = {
  encryptedVaultKey: string;
  vaultKeyNonce: string;
  keyDerivationSalt: string;
  keyDerivationParams: {
    algorithm: "Argon2id";
    iterations: number;
    memorySize: number;
    parallelism: number;
    hashLength: number;
  };
  encryptedRecoveryVaultKey?: string | null;
  recoveryVaultKeyNonce?: string | null;
};

const defaultKdfParams = {
  algorithm: "Argon2id" as const,
  iterations: 3,
  memorySize: 65536,
  parallelism: 1,
  hashLength: 32,
};

export async function createVaultEnvelope(
  masterPassword: string,
): Promise<{ envelope: VaultEnvelope; vaultKey: CryptoKey; recoveryKey: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const rawVaultKey = crypto.getRandomValues(new Uint8Array(32));
  const wrappingKey = await deriveKey(masterPassword, salt, defaultKdfParams);
  const vaultKeyNonce = crypto.getRandomValues(new Uint8Array(12));
  const encryptedVaultKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: vaultKeyNonce },
    wrappingKey,
    rawVaultKey,
  );
  const vaultKey = await crypto.subtle.importKey(
    "raw",
    rawVaultKey,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  const recoveryKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const recoveryWrappingKey = await crypto.subtle.importKey(
    "raw",
    recoveryKeyBytes,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  const recoveryVaultKeyNonce = crypto.getRandomValues(new Uint8Array(12));
  const encryptedRecoveryVaultKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: recoveryVaultKeyNonce },
    recoveryWrappingKey,
    rawVaultKey,
  );

  return {
    vaultKey,
    recoveryKey: toBase64(recoveryKeyBytes),
    envelope: {
      encryptedVaultKey: toBase64(new Uint8Array(encryptedVaultKey)),
      vaultKeyNonce: toBase64(vaultKeyNonce),
      keyDerivationSalt: toBase64(salt),
      keyDerivationParams: defaultKdfParams,
      encryptedRecoveryVaultKey: toBase64(
        new Uint8Array(encryptedRecoveryVaultKey),
      ),
      recoveryVaultKeyNonce: toBase64(recoveryVaultKeyNonce),
    },
  };
}

export async function unlockVaultWithRecovery(
  recoveryKey: string,
  envelope: VaultEnvelope,
): Promise<CryptoKey> {
  if (!envelope.encryptedRecoveryVaultKey || !envelope.recoveryVaultKeyNonce)
    throw new Error("Este vault no tiene una clave de recuperación configurada.");
  const recoveryWrappingKey = await crypto.subtle.importKey(
    "raw",
    fromBase64(recoveryKey.trim()),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const rawVaultKey = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(envelope.recoveryVaultKeyNonce) },
    recoveryWrappingKey,
    fromBase64(envelope.encryptedRecoveryVaultKey),
  );
  return crypto.subtle.importKey("raw", rawVaultKey, "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function createRecoveryVaultEnvelope(vaultKey: CryptoKey) {
  const recoveryKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const recoveryWrappingKey = await crypto.subtle.importKey(
    "raw",
    recoveryKeyBytes,
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const recoveryVaultKeyNonce = crypto.getRandomValues(new Uint8Array(12));
  const rawVaultKey = await crypto.subtle.exportKey("raw", vaultKey);
  const encryptedRecoveryVaultKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: recoveryVaultKeyNonce },
    recoveryWrappingKey,
    rawVaultKey,
  );
  return {
    recoveryKey: toBase64(recoveryKeyBytes),
    encryptedRecoveryVaultKey: toBase64(
      new Uint8Array(encryptedRecoveryVaultKey),
    ),
    recoveryVaultKeyNonce: toBase64(recoveryVaultKeyNonce),
  };
}

export async function createMasterPasswordEnvelope(
  masterPassword: string,
  vaultKey: CryptoKey,
): Promise<Pick<VaultEnvelope, "encryptedVaultKey" | "vaultKeyNonce" | "keyDerivationSalt" | "keyDerivationParams">> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrappingKey = await deriveKey(masterPassword, salt, defaultKdfParams);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const rawVaultKey = await crypto.subtle.exportKey("raw", vaultKey);
  const encryptedVaultKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    wrappingKey,
    rawVaultKey,
  );
  return {
    encryptedVaultKey: toBase64(new Uint8Array(encryptedVaultKey)),
    vaultKeyNonce: toBase64(nonce),
    keyDerivationSalt: toBase64(salt),
    keyDerivationParams: defaultKdfParams,
  };
}

export async function unlockVault(
  masterPassword: string,
  envelope: VaultEnvelope,
): Promise<CryptoKey> {
  const params = envelope.keyDerivationParams;
  const wrappingKey = await deriveKey(
    masterPassword,
    fromBase64(envelope.keyDerivationSalt),
    params,
  );
  const rawVaultKey = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(envelope.vaultKeyNonce) },
    wrappingKey,
    fromBase64(envelope.encryptedVaultKey),
  );
  return crypto.subtle.importKey("raw", rawVaultKey, "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptVaultPayload(
  vaultKey: CryptoKey,
  payload: unknown,
) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(payload));
  const encryptedData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    vaultKey,
    plaintext,
  );
  return {
    encryptedData: toBase64(new Uint8Array(encryptedData)),
    nonce: toBase64(nonce),
  };
}

export async function decryptVaultPayload<T>(
  vaultKey: CryptoKey,
  encryptedData: string,
  nonce: string,
): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(nonce) },
    vaultKey,
    fromBase64(encryptedData),
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}

type StoredSharingKey = {
  publicKey: JsonWebKey;
  encryptedPrivateKey: string;
  privateKeyNonce: string;
};

export async function ensureSharingKey(
  vaultKey: CryptoKey,
  accessToken: string,
  apiUrl: string,
) {
  const response = await fetch(`${apiUrl}/vaults/crypto-key`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const shouldCreateKey = response.status === 204 || response.status === 404;
  if (!shouldCreateKey && response.ok) {
    const stored = (await response.json()) as StoredSharingKey;
    const privateKey = await decryptVaultPayload<JsonWebKey>(
      vaultKey,
      stored.encryptedPrivateKey,
      stored.privateKeyNonce,
    );
    return { publicKey: stored.publicKey, privateKey };
  }
  if (!shouldCreateKey)
    throw new Error("No fue posible recuperar la clave de compartición.");

  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );
  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const encryptedPrivateKey = await encryptVaultPayload(vaultKey, privateKey);
  const createResponse = await fetch(`${apiUrl}/vaults/crypto-key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      publicKey,
      encryptedPrivateKey: encryptedPrivateKey.encryptedData,
      privateKeyNonce: encryptedPrivateKey.nonce,
    }),
  });
  if (!createResponse.ok)
    throw new Error("No fue posible configurar la clave de compartición.");
  return { publicKey, privateKey };
}

export type DocumentKeyEnvelope = {
  encryptedDocumentKey: string;
  documentKeyNonce: string;
};
export type RecipientDocumentKeyEnvelope = {
  senderPublicKey: JsonWebKey;
  encryptedItemKey: string;
  itemKeyNonce: string;
};

export async function promoteToDocumentKey(
  vaultKey: CryptoKey,
  payload: unknown,
): Promise<{
  documentKey: CryptoKey;
  ownerEnvelope: DocumentKeyEnvelope;
  encryptedData: string;
  nonce: string;
}> {
  const rawDocumentKey = crypto.getRandomValues(new Uint8Array(32));
  const documentKey = await crypto.subtle.importKey(
    "raw",
    rawDocumentKey,
    "AES-GCM",
    true,
    ["encrypt", "decrypt"],
  );
  const documentKeyNonce = crypto.getRandomValues(new Uint8Array(12));
  const encryptedDocumentKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: documentKeyNonce },
    vaultKey,
    rawDocumentKey,
  );
  const encryptedPayload = await encryptVaultPayload(documentKey, payload);
  return {
    documentKey,
    ownerEnvelope: {
      encryptedDocumentKey: toBase64(new Uint8Array(encryptedDocumentKey)),
      documentKeyNonce: toBase64(documentKeyNonce),
    },
    ...encryptedPayload,
  };
}

export async function unwrapOwnerDocumentKey(
  vaultKey: CryptoKey,
  envelope: DocumentKeyEnvelope,
): Promise<CryptoKey> {
  const rawDocumentKey = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(envelope.documentKeyNonce) },
    vaultKey,
    fromBase64(envelope.encryptedDocumentKey),
  );
  return crypto.subtle.importKey("raw", rawDocumentKey, "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function createRecipientDocumentKeyEnvelope(
  documentKey: CryptoKey,
  recipientPublicKey: JsonWebKey,
): Promise<RecipientDocumentKeyEnvelope> {
  const recipientKey = await crypto.subtle.importKey(
    "jwk",
    recipientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );
  const wrappingKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: recipientKey },
    ephemeralKeyPair.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const rawDocumentKey = await crypto.subtle.exportKey("raw", documentKey);
  const itemKeyNonce = crypto.getRandomValues(new Uint8Array(12));
  const encryptedItemKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: itemKeyNonce },
    wrappingKey,
    rawDocumentKey,
  );
  return {
    senderPublicKey: await crypto.subtle.exportKey(
      "jwk",
      ephemeralKeyPair.publicKey,
    ),
    encryptedItemKey: toBase64(new Uint8Array(encryptedItemKey)),
    itemKeyNonce: toBase64(itemKeyNonce),
  };
}

export async function unwrapRecipientDocumentKey(
  vaultKey: CryptoKey,
  storedKey: StoredSharingKey,
  envelope: RecipientDocumentKeyEnvelope,
): Promise<CryptoKey> {
  const privateKeyJwk = await decryptVaultPayload<JsonWebKey>(
    vaultKey,
    storedKey.encryptedPrivateKey,
    storedKey.privateKeyNonce,
  );
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"],
  );
  const senderKey = await crypto.subtle.importKey(
    "jwk",
    envelope.senderPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const wrappingKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: senderKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const rawDocumentKey = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(envelope.itemKeyNonce) },
    wrappingKey,
    fromBase64(envelope.encryptedItemKey),
  );
  return crypto.subtle.importKey("raw", rawDocumentKey, "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  params: VaultEnvelope["keyDerivationParams"],
) {
  const derivedKey = await argon2id({
    password,
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memorySize,
    hashLength: params.hashLength,
    outputType: "binary",
  });
  const keyMaterial = derivedKey.buffer.slice(
    derivedKey.byteOffset,
    derivedKey.byteOffset + derivedKey.byteLength,
  ) as ArrayBuffer;
  return crypto.subtle.importKey("raw", keyMaterial, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
