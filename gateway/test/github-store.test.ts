import assert from "node:assert/strict";
import { generateKeyPairSync, webcrypto } from "node:crypto";
import test from "node:test";
import { privateKeyPkcs8Bytes } from "../src/github-store";

async function importsAsPkcs8(pem: string): Promise<void> {
  const bytes = privateKeyPkcs8Bytes(pem);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  await webcrypto.subtle.importKey(
    "pkcs8",
    copy.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

test("accepts GitHub's PKCS#1 RSA private key download", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
  const pem = privateKey.export({ format: "pem", type: "pkcs1" }).toString();
  await assert.doesNotReject(importsAsPkcs8(pem));
});

test("keeps PKCS#8 private keys importable", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  await assert.doesNotReject(importsAsPkcs8(pem));
});
