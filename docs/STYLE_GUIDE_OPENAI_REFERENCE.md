# LearnHub UI/UX 스타일 가이드

> Version 1.0 · 2026-09-09  
> Reference: [OpenAI](https://openai.com/ko-KR/) · [OpenAI Academy](https://academy.openai.com/)

## 1. 디자인 원칙

LearnHub의 시각 언어는 OpenAI 메인의 절제된 편집 디자인과 OpenAI Academy의 명확한 학습 탐색 구조를 결합한다. 레퍼런스의 로고나 화면을 복제하지 않고 다음 원칙을 제품 문맥에 맞게 사용한다.

1. **콘텐츠가 먼저다.** 장식보다 제목, 설명, 다음 행동 순으로 시선이 흐르게 한다.
2. **한 화면에는 하나의 주 행동만 둔다.** 홈에서는 `학습 주제 입력` 또는 `이어서 학습하기`가 유일한 Primary Action이다.
3. **색보다 구조로 의미를 구분한다.** UI는 흑백과 중성 회색만 사용하고, AI·진행·선택 상태는 명도·선·아이콘·문장으로 구분한다.
4. **여백으로 계층을 만든다.** 박스와 그림자를 반복하지 않고 8pt 간격과 헤어라인으로 그룹을 구분한다.
5. **차분하게 반응한다.** 모션은 120–200ms, 이동은 최대 2px로 제한하며 bounce와 과한 scale 효과는 사용하지 않는다.

## 2. 그리드와 레이아웃

### Desktop · 1280px 이상

- App shell: 좌측 내비게이션 `260px` + 유동형 콘텐츠
- 콘텐츠 최대 너비: `1120px`
- 콘텐츠 좌우 여백: `56px`
- 기본 그리드: 12 columns, gutter `24px`
- 읽기 화면 본문: `720–760px`
- 홈 히어로 카피: 최대 `768px`

### Tablet · 768–1279px

- 사이드바는 유지하되 본문 좌우 여백을 `32px`로 축소한다.
- 카드 그리드는 2열을 유지하며 카드 최소 너비는 `280px`이다.

### Mobile · 320–767px

- 사이드바는 drawer로 전환한다.
- 콘텐츠 좌우 여백: `20px`
- 모든 주요 버튼과 입력의 터치 영역: 최소 `44×44px`
- 카드·폼은 1열, 지표는 짧은 3열을 유지하되 라벨을 축약한다.

## 3. 간격 시스템

8pt 기반을 기본으로 하고, 조밀한 UI에서만 4px 단위를 허용한다.

| Token | Value | Use |
|---|---:|---|
| `space-1` | 4px | 아이콘과 짧은 라벨 |
| `space-2` | 8px | 버튼 내부, 작은 항목 간격 |
| `space-3` | 12px | 입력 내부, 목록 행 |
| `space-4` | 16px | 카드 내부 최소 패딩 |
| `space-5` | 24px | 카드 패딩, 작은 섹션 |
| `space-6` | 32px | 관련 섹션 사이 |
| `space-7` | 48px | 페이지 섹션 사이 |
| `space-8` | 64px | 주요 페이지 구획 |
| `space-9` | 96px | 데스크톱 히어로 |

## 4. 타이포그래피

### Font family

```css
font-family: "Pretendard Variable", Pretendard, "Noto Sans KR",
  "Apple SD Gothic Neo", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

OpenAI Sans는 전용 서체이므로 사용하지 않는다. 한국어 가독성과 운영 안정성을 위해 로컬 시스템 sans stack을 사용한다. 숫자와 코드에는 `SFMono-Regular`, `Consolas`, monospace를 사용한다.

| Role | Size / Line height | Weight | Tracking |
|---|---|---:|---:|
| Display | 40–76 / 0.98 | 600 | -5.5% |
| Page title | 32–40 / 1.1 | 600 | -3% |
| Section title | 24–30 / 1.2 | 600 | -3% |
| Card title | 18–20 / 1.3 | 600 | -2.5% |
| Body large | 18 / 1.55 | 400 | 0 |
| Body | 16 / 1.6 | 400 | 0 |
| UI label | 14 / 1.4 | 500–600 | 0 |
| Kicker | 12 / 1.3 | 700 | +8% |
| Caption | 12 / 1.4 | 400–500 | 0 |

- 제목에는 700 이상을 남용하지 않는다.
- 본문 한 줄 길이는 한국어 기준 약 35–55자로 제한한다.
- 긴 설명은 `text-secondary`, 핵심 행동과 제목은 `text-primary`를 쓴다.

## 5. 컬러 토큰

| CSS token | Hex | 역할 |
|---|---|---|
| `--lh-canvas` | `#F7F7F5` | 앱 배경 |
| `--lh-surface` | `#FFFFFF` | 카드·헤더·입력 |
| `--lh-surface-subtle` | `#F1F1EE` | hover·보조 그룹 |
| `--lh-surface-strong` | `#E8E8E4` | disabled·progress track |
| `--lh-ink` | `#111110` | 제목·Primary button |
| `--lh-ink-secondary` | `#5F5F5A` | 본문·nav 기본 |
| `--lh-ink-tertiary` | `#858580` | caption·metadata |
| `--lh-line` | `#DEDED9` | 기본 hairline |
| `--lh-line-strong` | `#C8C8C2` | 입력·강조 경계 |
| `--lh-primary` | `#4169E1` | 브랜드 포인트·주요 CTA·선택 상태 |
| `--lh-secondary` | `#F38132` | 보조 강조·복습·주의가 필요한 상태 |
| `--lh-danger` | `#B42318` | 복구가 필요한 오류 |

### 사용 규칙

- 기본 화면은 canvas/surface/ink 계열로 차분하게 유지한다.
- Royal Blue는 주요 CTA와 현재 선택 상태에 제한적으로 사용한다.
- Warm Orange는 복습, 보조 강조 등 두 번째 위계에 사용하며 Blue와 경쟁시키지 않는다.
- 유채색 그라데이션은 사용하지 않는다.
- 상태 차이는 명도, 굵기, 아이콘, 레이블을 함께 사용해 전달한다.
- 성공/오류를 색만으로 전달하지 않고 아이콘과 문장을 함께 쓴다.

## 6. Shape, border, shadow

- 작은 control: radius `8px`
- 카드·fieldset: radius `14px`
- 주요 입력·큰 hero card: radius `20–22px`
- CTA·chip: radius `999px`
- 기본 border: `1px solid var(--lh-line)`
- 그림자는 겹침이 필요한 modal, floating action, hover card에만 사용한다.
- 카드가 나란히 반복될 때는 border와 여백을 우선하고 그림자를 기본값으로 쓰지 않는다.

## 7. 컴포넌트 규칙

### Buttons

- Primary: Royal Blue 배경, 흰색 label, 한 화면에 하나
- Secondary: 흰 배경 + hairline, pill 형태
- Tertiary: border 없이 hover 시 subtle surface
- Destructive: 사용자가 결과를 이해하는 문장과 danger 색을 함께 사용
- 아이콘은 16px, label과 간격은 8px

### Inputs

- 일반 입력 높이 `48px`, 홈 prompt 입력은 `64px` 이상
- placeholder는 tertiary, 입력값은 ink
- focus 상태는 `2px ink outline + 3px offset`
- 옵션이 많으면 기본 흐름에서 분리해 `선택 설정` disclosure에 둔다.

### Navigation

- sidebar 활성 항목: surface-strong 배경 + ink 텍스트
- 아이콘과 텍스트를 함께 제공하며 이모지를 탐색 아이콘으로 사용하지 않는다.
- 현재 위치 외의 항목에 면 배경을 상시 노출하지 않는다.

### Course card

- cover, title, summary, progress 순서
- cover는 중성 회색의 명도와 패턴으로만 구분한다.
- hover 시 `translateY(-2px)`와 medium shadow까지만 허용한다.

### Modal

- 최대 너비 `512px`, 최대 높이 `90vh`
- 질문은 한 번에 하나를 먼저 보여준다.
- 부가 옵션은 접힌 disclosure로 제공하고 기본값을 명확히 둔다.
- 하단 Primary Action 문구는 결과를 직접 설명한다. 예: `학습 경로 만들기`.

## 8. 접근성과 상태

- 본문/배경 명암비는 WCAG AA `4.5:1` 이상, 큰 텍스트는 `3:1` 이상을 목표로 한다.
- 모든 interactive element는 keyboard focus를 제공한다.
- `prefers-reduced-motion`에서 transition과 animation을 사실상 제거한다.
- 로딩 버튼은 disabled 처리와 spinner, 현재 동작 문구를 함께 제공한다.
- 비어 있음, 오류, 권한 필요 상태는 사용자가 취할 수 있는 다음 행동을 한 문장으로 제시한다.

## 9. 콘텐츠 보이스

- 짧고 직접적인 존댓말을 쓴다.
- 기능명이 아니라 사용자가 얻는 결과를 말한다.
- 과장된 성공 문구, 감탄사, 다수의 이모지를 피한다.

| Avoid | Use |
|---|---|
| `AI가 마법처럼 완벽한 수업을 만들어드려요!` | `관심 주제로 학습 경로를 만들어요.` |
| `대단해요! 100 XP 획득!` | `레슨을 완료했어요. 다음 복습은 내일입니다.` |
| `제출` | `학습 경로 만들기` |
| `설정` | `하루 학습 시간` |

## 10. 구현 체크리스트

- [ ] 화면의 주 행동이 3초 안에 식별되는가?
- [ ] 임의의 hex 대신 `--lh-*` 토큰을 우선 사용했는가?
- [ ] 8pt 간격 체계를 지켰는가?
- [ ] 이모지에 의존하지 않고 일관된 icon set을 사용했는가?
- [ ] mobile 320px에서 가로 스크롤이 없는가?
- [ ] keyboard로 주요 흐름을 완료할 수 있는가?
- [ ] focus, hover, disabled, loading, error 상태가 모두 있는가?
- [ ] reduced motion 환경에서도 정보를 잃지 않는가?
