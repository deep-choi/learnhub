import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("account deletion RPC is self-scoped and cascades through auth user ownership", () => {
  const initial = readFileSync(new URL("../supabase/migrations/20260909_learnhub_initial.sql", import.meta.url), "utf8");
  const deletion = readFileSync(new URL("../supabase/migrations/20260915_delete_my_account.sql", import.meta.url), "utf8");
  assert.match(initial, /references auth\.users \(id\) on delete cascade/iu);
  assert.match(deletion, /current_user_id uuid := auth\.uid\(\)/iu);
  assert.match(deletion, /delete from auth\.users where id = current_user_id/iu);
  assert.match(deletion, /revoke all on function public\.delete_my_account\(\) from anon/iu);
  assert.match(deletion, /grant execute on function public\.delete_my_account\(\) to authenticated/iu);
});
