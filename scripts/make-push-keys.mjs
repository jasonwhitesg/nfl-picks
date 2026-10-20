// Makes the one-time push keys for phone notifications (no extra packages needed).
// Run:  node scripts/make-push-keys.mjs
// It saves them to push-keys.txt in your Documents folder (NOT in the project),
// so the private key never ends up in git or on screen.
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const out = join(homedir(), "Documents", "push-keys.txt");
if (existsSync(out)) {
  console.log(`Keys already exist at ${out}. Delete that file first if you really want new ones.`);
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });
const b64url = (buf) => buf.toString("base64url");
// Public key = uncompressed point 0x04 || X || Y
const publicRaw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]);

writeFileSync(
  out,
  [
    "Push notification keys - keep this file private.",
    "",
    "Supabase -> Edge Functions -> Secrets:",
    `VAPID_PUBLIC_KEY=${b64url(publicRaw)}`,
    `VAPID_PRIVATE_KEY=${priv.d}`,
    "VAPID_SUBJECT=<your app's web address, e.g. https://your-app.vercel.app>",
    "",
    "Vercel -> Project -> Settings -> Environment Variables (public key only):",
    `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${b64url(publicRaw)}`,
    "",
  ].join("\n"),
);
console.log(`Saved push keys to ${out}`);
