import assert from "node:assert/strict";
import test from "node:test";
import { GUEST_TRIAL_LIMIT, GuestTrialExhaustedError, GuestTrialQuota, GuestTrialUnavailableError } from "../server/guestTrial";

const DEVICE = "11111111-1111-4111-8111-111111111111";

test("게스트 체험은 기기당 10회까지 허용하고 남은 횟수를 알려 준다", async () => {
  const quota = new GuestTrialQuota();
  const remaining: number[] = [];
  for (let i = 0; i < GUEST_TRIAL_LIMIT; i += 1) remaining.push((await quota.reserve(DEVICE, "203.0.113.1")).remaining);
  assert.deepEqual(remaining, [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  await assert.rejects(quota.reserve(DEVICE, "203.0.113.1"), GuestTrialExhaustedError);
});

test("다른 기기는 자기 10회를 따로 받는다", async () => {
  const quota = new GuestTrialQuota();
  for (let i = 0; i < GUEST_TRIAL_LIMIT; i += 1) await quota.reserve(DEVICE, "203.0.113.1");
  const other = await quota.reserve("22222222-2222-4222-8222-222222222222", "203.0.113.2");
  assert.equal(other.remaining, GUEST_TRIAL_LIMIT - 1);
});

test("답을 만들지 못한 요청은 되돌려 횟수를 쓰지 않은 것으로 센다", async () => {
  const quota = new GuestTrialQuota();
  const ticket = await quota.reserve(DEVICE, "203.0.113.1");
  assert.equal(ticket.remaining, 9);
  await quota.release(ticket);
  assert.equal((await quota.reserve(DEVICE, "203.0.113.1")).remaining, 9);
});

test("기기 id를 바꿔도 같은 IP의 하루 상한을 넘지 못한다", async () => {
  const quota = new GuestTrialQuota({ perIpPerDay: 3 });
  for (let i = 0; i < 3; i += 1) await quota.reserve(`aaaaaaa${i}-1111-4111-8111-111111111111`, "203.0.113.9");
  await assert.rejects(quota.reserve("bbbbbbbb-1111-4111-8111-111111111111", "203.0.113.9"), GuestTrialUnavailableError);
  // 다른 IP는 영향을 받지 않는다.
  assert.equal((await quota.reserve("bbbbbbbb-1111-4111-8111-111111111111", "203.0.113.10")).remaining, GUEST_TRIAL_LIMIT - 1);
});

test("전체 하루 상한에 닿으면 새 기기도 받지 못한다", async () => {
  const quota = new GuestTrialQuota({ globalPerDay: 2 });
  await quota.reserve("aaaaaaaa-1111-4111-8111-111111111111", "203.0.113.1");
  await quota.reserve("bbbbbbbb-1111-4111-8111-111111111111", "203.0.113.2");
  await assert.rejects(quota.reserve("cccccccc-1111-4111-8111-111111111111", "203.0.113.3"), GuestTrialUnavailableError);
});

test("날이 바뀌면 IP·전체 일일 합계는 새로 시작하지만 기기 누적은 유지된다", async () => {
  let now = new Date("2026-10-16T10:00:00.000Z");
  const quota = new GuestTrialQuota({ perIpPerDay: 1, now: () => now });
  await quota.reserve(DEVICE, "203.0.113.1");
  await assert.rejects(quota.reserve(DEVICE, "203.0.113.1"), GuestTrialUnavailableError);
  now = new Date("2026-10-17T10:00:00.000Z");
  assert.equal((await quota.reserve(DEVICE, "203.0.113.1")).remaining, GUEST_TRIAL_LIMIT - 2);
});

test("사용량 제한을 끄면 횟수를 세지 않는다", async () => {
  const quota = new GuestTrialQuota({ usageLimitsEnabled: false });
  for (let i = 0; i < GUEST_TRIAL_LIMIT + 5; i += 1) assert.equal((await quota.reserve(DEVICE, "203.0.113.1")).remaining, GUEST_TRIAL_LIMIT);
});

test("잘못된 접속 정보와 한도 설정은 거부한다", async () => {
  assert.throws(() => new GuestTrialQuota({ perDevice: 0 }));
  await assert.rejects(new GuestTrialQuota().reserve("", "203.0.113.1"));
  await assert.rejects(new GuestTrialQuota().reserve(DEVICE, ""));
});
