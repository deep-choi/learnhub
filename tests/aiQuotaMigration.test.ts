import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("durable AI quota migration is account-scoped and atomic", () => {
  const sql = fs.readFileSync("supabase/migrations/20260915_ai_daily_quota.sql", "utf8");
  assert.match(sql, /create table if not exists public\.ai_usage_daily/u);
  assert.match(sql, /primary key \(owner_id, usage_day\)/u);
  assert.match(sql, /references auth\.users \(id\) on delete cascade/u);
  assert.match(sql, /security definer/u);
  assert.match(sql, /auth\.uid\(\)/u);
  assert.match(sql, /on conflict on constraint ai_usage_daily_pkey do update/u);
  assert.match(sql, /usage\.requests < quota\.per_user_request_limit/u);
  assert.match(sql, /grant execute on function public\.reserve_ai_daily_usage\(integer\) to authenticated/u);
});
