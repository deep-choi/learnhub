# LearnHub 결제·환불 검토

기준: 2026-10-21. 현재 저장소에는 운영 중인 결제 공급자, 상품, 영수증 검증, 환불 실행 연동이 없다. `/admin?tab=billing`은 미연동 상태를 명시한다. 빈 주문 데이터를 실제 거래 조회 결과로 해석하거나 환불 완료를 수동으로 만들어내지 않는다.

## 먼저 결정할 사항

1. 상품: 월 구독 / 사용량 충전 / 일회성 구매. 반복 AI 비용이 발생하므로 무제한 평생 이용을 약속하기 전에 사용자당 원가를 측정한다.
2. 판매 경로: Google Play 앱 결제와 웹 결제. 웹 PG를 붙인다고 Android 앱 내 판매까지 자동 해결되지 않는다. 실제 판매 국가·상품·배포 방식의 최신 결제 정책을 확인한다.
3. 가격·무료 범위·갱신 방식·사용량 소진 처리·세금 및 사업자 정보.
4. 취소·전액/부분 환불·이미 사용한 혜택·서비스 장애 보상 기준. 확정 전 임의의 환불 기간이나 법적 권리를 만들어 공지하지 않는다.

구독 또는 충전형은 검토 후보이며 확정 상품이 아니다. 결제 계약과 환불 정책은 운영자 결정 후 공개 안내와 함께 적용한다.

## 관리자 화면

**결제 내역:** 주문 ID, 공급자, 사용자 UID, 상품, 구매 일시, 공급자가 확인한 금액/통화, 결제 상태, 현재 이용 권한, 최근 동기화 시각. 목록 검색과 주문 상세를 제공한다.

**환불 요청:** 원결제, 신청 사유, 이미 환불한 금액, 남은 환불 가능 금액, 현재 혜택/이용 상태, 운영 메모, 처리 담당자. 실행 전 원결제와 금액을 다시 조회하고 대상을 확인한다.

구독 해지(다음 결제 중단), 환불(금액 반환), 이용 권한 회수는 별도 동작으로 표현한다. Google Play에서 구독 취소는 자동 환불이 아니며, 선택한 API와 상품 종류에 따라 환불과 권한 회수를 함께 처리할 수 있다.

## 서버 데이터와 처리 흐름

- `billingOrders/{provider-order-id}`: UID, provider, productId, amountMinor(정수), currency, purchasedAt, paymentStatus, refundedAmountMinor, lastVerifiedAt. 금액과 소유권은 클라이언트 값을 신뢰하지 않고 공급자에서 검증한다.
- `billingRefundRequests/{id}`: 원결제 ID, 사유, 요청 금액, 상태(`requested/reviewing/processing/succeeded/failed`), idempotencyKey, 운영자, 시각, 공급자 결과 ID.
- `billingEvents/{provider-event-id}`: 서명/인증 검증된 이벤트 수신과 처리 상태. 이벤트 중복·역순 수신을 처리하고 공급자 원본을 재조회한다.
- `billingEntitlements/{uid}`: 결제와 연결된 실제 서비스 권한. 결제 확인/갱신/환불/취소/권한 회수 이벤트로 갱신한다.

환불 실행은 서버에서 중복 실행을 차단한 뒤 공급자를 호출하고, 확인된 결과에 따라 주문·권한·이력을 갱신한다. 응답 유실/타임아웃은 성공 또는 실패로 단정하지 않고 `processing`으로 유지한 뒤 공급자 조회로 정산한다. 실제 공급자 확인 없이 운영자가 `succeeded`로 바꾸는 API는 만들지 않는다.

결제 키·구매 토큰·카드 정보를 관리자 목록이나 감사 로그에 노출하지 않는다. 결제 자료의 보관·탈퇴 후 처리 기준은 확정된 운영 정책 및 적용 요건과 맞춘다.

## 구현 및 출시 순서

1. 상품·판매 경로·정책 확정 및 결제 공급자 계약/콘솔 준비.
2. 테스트 결제 → 서버 영수증 검증 → 서비스 권한 지급.
3. 공급자 이벤트 수신·재시도·정기 대사.
4. 관리자 주문/환불 조회 및 공급자 연동 환불.
5. 중복 환불, 부분 환불 누계, 권한 회수, 갱신 실패, 통신 실패 후 복구 테스트.
6. 테스트 계정과 실제 Android 기기에서 결제/복원/환불 확인 후 판매 개시.

공식 참고:

- Firebase 관리자 권한: https://firebase.google.com/docs/auth/admin/custom-claims
- Play 구매 검증/확인: https://developer.android.com/google/play/billing/integrate
- Play 주문·취소·환불·권한 관리: https://developer.android.com/google/play/billing/manage-purchases
- Play 구독 환불/권한 회수 API: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/revoke
