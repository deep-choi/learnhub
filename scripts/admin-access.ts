import dotenv from "dotenv";
import { firebaseAdminAuth, projectId } from "../server/firebaseRuntime";

dotenv.config({ quiet: true });
dotenv.config({ path: "functions/.env.learnhub-1de94", quiet: true });
const args = process.argv.slice(2);
const emailAt = args.indexOf("--email");
const email = emailAt >= 0 ? args[emailAt + 1] : "";
const revoke = args.includes("--revoke");
if (!email || !email.includes("@") || args.some((arg, i) => arg !== "--email" && arg !== "--revoke" && i !== emailAt + 1)) {
  console.error("사용법: npm run admin:access -- --email owner@example.com [--revoke]");
  process.exitCode = 1;
} else {
  try {
    if (!projectId()) throw new Error("프로젝트 ID가 필요합니다.");
    const auth = firebaseAdminAuth();
    const user = await auth.getUserByEmail(email);
    const claims = { ...(user.customClaims || {}) };
    if (revoke) delete claims.admin; else claims.admin = true;
    await auth.setCustomUserClaims(user.uid, claims);
    if (revoke) await auth.revokeRefreshTokens(user.uid);
    console.log(`${projectId()}: ${email} 관리자 권한 ${revoke ? "해제" : "부여"} 완료. ${revoke ? "기존 세션은 만료되어 다시 로그인이 필요합니다." : "관리자 페이지에서 새로고침하면 반영됩니다."}`);
    if (revoke && (process.env.LEARNHUB_ADMIN_UIDS || "").split(",").map(value => value.trim()).includes(user.uid)) {
      console.log("이 UID는 LEARNHUB_ADMIN_UIDS에도 있습니다. 서버 allowlist에서도 제거해야 접근이 차단됩니다.");
    }
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "CREDENTIAL_OR_CONFIGURATION_ERROR";
    console.error(`관리자 권한 변경 실패 (${code}). 프로젝트 및 Application Default Credentials를 확인해 주세요.`);
    process.exitCode = 1;
  }
}
