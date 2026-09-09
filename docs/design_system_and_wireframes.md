# LearnHub UI/UX & Brand Design System Specification
**Project**: LearnHub (Intellectual Learning & Knowledge Management System)  
**Role**: Product UI/UX Designer & Brand Director  
**Design Paradigm**: Notion-inspired Extreme Minimalism, Monochrome Modernism, Typographic Rigor  
**Target Audience**: Intellectuals, Researchers, Engineers, Lifelong Autonomous Learners  

---

## 1. Executive Summary & Design Vision

> "Good design is as little design as possible." — Dieter Rams  
> "Knowledge does not need neon lights; it requires clarity, structure, and quiet focus."

LearnHub의 인터페이스는 듀오링고(Duolingo) 스타일의 화려한 색상, 알록달록한 보상 뱃지, 유치한 캐릭터, 과장된 애니메이션 등 '아동용/게임형 UI'를 **철저히 배제**합니다.  
우리의 디자인은 **노션(Notion), iA Writer, Readwise Reader, Linear**와 같은 프로덕트가 지향하는 **'조용한 아키텍처(Quiet Architecture)'**를 계승합니다. 

인터페이스는 사용자 앞을 가로막지 않고 투명하게 배경으로 물러서며, 화면 위에 오직 **텍스트, 타이포그래피의 엄격한 위계, 지식의 연결 구조**만이 깊은 몰입감과 안정감을 주도록 설계됩니다.

---

## 2. Brand Design System

### 2.1 Color Architecture: The Monochrome Spectrum
색상은 정보를 꾸미기 위한 도구가 아니라, 오직 **'의미 전달'과 '시각적 계층 구분'**을 위한 최소한의 수단으로만 사용됩니다. 기본적으로 무채색(Grayscale) 기반의 종이 질감(Paper texture) 느낌을 전달합니다.

#### Light Canvas Palette (Primary Default)
| Token | Hex | Tailwind Equivalent | Role & Semantic Usage |
| :--- | :--- | :--- | :--- |
| `canvas-bg` | `#FFFFFF` | `bg-white` | 메인 콘텐츠 영역 캔버스 |
| `canvas-subtle` | `#FBFBFA` | `bg-[#FBFBFA]` | Notion 고유의 따뜻한 오프화이트 기본 배경 |
| `surface-secondary`| `#F7F6F3` | `bg-[#F7F6F3]` | 사이드바, 카드, 호버 배경, 콜아웃 배경 |
| `surface-hover` | `#EFEFED` | `hover:bg-[#EFEFED]` | 리스트 아이템 마우스 오버 시 미세한 피드백 |
| `border-hairline` | `#E9E9E7` | `border-[#E9E9E7]` | 1px 핵심 분리선 (극도로 얇고 은은한 경계) |
| `border-medium` | `#D3D3D0` | `border-[#D3D3D0]` | 인풋 박스 포커스 전, 테이블 헤더 구분선 |
| `border-strong` | `#37352F` | `border-[#37352F]` | 액티브 탭 인디케이터, 포커스 링 |
| `text-primary` | `#2F3437` | `text-[#2F3437]` | 본문 텍스트, 헤딩 (순수 블랙보다 눈이 편한 Charcoal Black) |
| `text-secondary` | `#787774` | `text-[#787774]` | 메타데이터, 보조 설명, 작성일시 |
| `text-tertiary` | `#9B9A97` | `text-[#9B9A97]` | 플레이스홀더, 단축키 힌트, 비활성 아이콘 |
| `badge-black` | `#191919` | `bg-[#191919] text-white` | 단일 액센트: 완벽 습득 상태, 핵심 액션 버튼 |

#### Dark Canvas Palette (Alternative Monochrome Dark)
- `canvas-bg`: `#191919` (순수 블랙 #000000 대신 눈의 피로도를 낮추는 Charcoal Dark)
- `surface-secondary`: `#202020`
- `surface-hover`: `#2C2C2C`
- `border-hairline`: `#2E2E2E`
- `text-primary`: `#EDEDEB`
- `text-secondary`: `#9B9B9B`

#### Functional Accents (극도로 제한된 액센트 원칙)
- **절대 금지**: 무지개색 진행 바, 쨍한 네온 옐로/퍼플/그린 그라데이션.
- **AI Assist Indicator**: 노션 AI 감성의 극도로 옅은 바이올렛 틴트 (`rgba(155, 81, 224, 0.07)` 배경, `#6E56CF` 심볼 ✦) 또는 순수 블랙/화이트 반전.
- **Knowledge Retention Tone**: 단일 색상의 농도(Opacity) 변화(25%, 50%, 75%, 100%)로 표현.

---

### 2.2 Typography Hierarchy: Editorial Rigor
타이포그래피는 LearnHub의 비주얼 아이덴티티의 핵심입니다. 장식적 요소가 없는 만큼 글꼴의 비례, 행간, 자간이 디자인의 인상을 결정합니다.

#### Font Stacks
1. **Primary UI & Reading**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Pretendard`, `sans-serif`  
   *(노션의 현대적이고 기하학적인 가독성)*
2. **Editorial Serif (본문 읽기 옵션 토글 가능)**: `Newsreader`, `Charter`, `Iowan Old Style`, `serif`  
   *(장문의 철학/인문/원리 학습 시 깊이 있는 독서 경험 제공)*
3. **Monospace (코드, 메트릭, 단축키)**: `JetBrains Mono`, `SF Mono`, `Menlo`, `monospace`

#### Modular Scale & Leading
| Level | Font Size | Weight | Line Height | Tracking | Application |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Document Title** | 36px (2.25rem) | Bold (700) | 1.25 | `-0.03em` | 레슨 메인 제목, 대시보드 인사말 |
| **Section H1** | 24px (1.5rem) | SemiBold (600) | 1.3 | `-0.02em` | 대시보드 주요 섹션, 챕터 대제목 |
| **Section H2** | 18px (1.125rem)| SemiBold (600) | 1.4 | `-0.01em` | 소주제, 카드 블록 헤더 |
| **Section H3** | 14px (0.875rem)| SemiBold (600) | 1.4 | `+0.04em` | 대문자 라벨, 통계 레이블 (`UPPERCASE`) |
| **Body (Reading)** | 16px (1.0rem) | Regular (400) | **1.75** | `-0.01em` | 학습 뷰어 본문 텍스트 (시독성 극대화) |
| **Body (Dense UI)**| 14px (0.875rem)| Regular (400) | 1.5 | `0em` | 대시보드 리스트, 메뉴, 사이드바 항목 |
| **Caption / Meta** | 12px (0.75rem) | Regular (400) | 1.4 | `+0.01em` | 날짜, 소요 시간, 카테고리 태그 |
| **Code / Kbd** | 12px (0.75rem) | Medium (500) | 1.4 | `+0.02em` | 단축키 뱃지 (`⌘K`), 소스 코드 블록 |

---

### 2.3 Spacing & Grid Philosophy: "Whitespace as Content"
1. **8pt Harmonic Spacing Rule**:
   - Spacing Scale: `4px` (xxs), `8px` (xs), `12px` (sm), `16px` (md), `24px` (lg), `32px` (xl), `48px` (2xl), `64px` (3xl).
2. **Contained Reading Column (시독폭 제한)**:
   - 교과목 학습 뷰어의 본문 가로폭은 한 줄당 65~75자가 들어오는 **최대 760px**로 고정합니다. (노션의 기본 뷰와 동일)
   - 모니터가 아무리 커도 텍스트가 좌우로 늘어나지 않으며, 좌우 여백은 완벽한 여백의 미(Cenetered Margins)로 호흡을 틔워줍니다.
3. **No Decorative Card Borders**:
   - 그림자(Shadow)를 덕지덕지 바르는 대신, 배경색(`surface-secondary`)과 1px의 투명도 있는 헤어라인(`border-hairline`)만으로 단면을 분할합니다.

---

## 3. Core Screen Wireframes & Component Layouts (Text-based Wireframe)

---

### 화면 1: 메인 학습 대시보드 (Personal Knowledge Base & Index)
- **컨셉**: '게임 로비'가 아니라, 학자의 잘 정돈된 **'서재(Study)'이자 '연구 색인(Research Index)'**.
- **주요 기능**: 지식 습득 케이던스, 진행 중인 심화 학습 복귀, 망각 곡선 기반 복습 큐, 전체 지식 베이스 아카이브.

```text
+---------------------------------------------------------------------------------------------------------+
| [N] LearnHub   Search or Jump to... [ ⌘ K ]                                 Focus Mode [ F ]   (●) You  |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|  INDEX / DASHBOARD                                                              Wed, Sep 9, 2026        |
|  # Intellectual Trajectory                                                                              |
|  "The object of education is not to learn, but to think."                                               |
|                                                                                                         |
|  +---------------------------------------------------------------------------------------------------+  |
|  | KNOWLEDGE CADENCE & RETENTION METRICS                                                             |  |
|  |                                                                                                   |  |
|  |  Active Inquiries    Deep Reading Time    Retention Rate        Spaced Review Due                 |  |
|  |  8 consecutive days  24.5 hrs this month  88.4% (Stable)        3 concepts today [ Review ⏎ ]     |  |
|  |                                                                                                   |  |
|  |  Historical Density (Last 12 Weeks)                                                               |  |
|  |  Mon [ ][ ][■][■][ ][ ][■][■][■][ ][■][■]                                                         |  |
|  |  Wed [ ][■][■][■][ ][■][■][■][■][■][■][■]  Less [ ][░][▒][▓][■] More  (38 hours dedicated)        |  |
|  |  Fri [■][■][ ][■][■][■][ ][■][■][■][■][■]                                                         |  |
|  +---------------------------------------------------------------------------------------------------+  |
|                                                                                                         |
|  CONTINUE INQUIRY (CURRENT READINGS)                                             + New Learning Track   |
|  -----------------------------------------------------------------------------------------------------  |
|  • [📄] Distributed Systems: Raft Consensus Algorithm                     Chapter 3 / Lesson 2          |
|        Last studied: Today 10:20 AM  •  Estimated: 14 min read            [ Resume Reading ⏎ ]          |
|                                                                                                         |
|  • [📄] Advanced Category Theory for Programmers                          Chapter 1 / Lesson 4          |
|        Last studied: Yesterday       •  Estimated: 25 min read            [ Resume Reading ]            |
|                                                                                                         |
|  KNOWLEDGE DATABASE & CURATED TRACKS                                              Filter [ ▽ ]  Sort [ ⇅ ]|
|  -----------------------------------------------------------------------------------------------------  |
|  NAME                               DOMAIN         STATUS        MASTERY LEVEL    LAST REVIEWED  TOPICS |
|  -----------------------------------------------------------------------------------------------------  |
|  [>] Computer Architecture          Systems        Active        Internalized     2 days ago     18/20  |
|  [>] Type Systems & Semantics       PL Theory      Active        Synthesized      Yesterday      12/16  |
|  [>] Modern Database Internals      Databases      Queued        Encountered      Sep 01, 2026   04/24  |
|  [>] Cryptographic Protocols        Security       Mastered      Internalized     Aug 28, 2026   15/15  |
|  -----------------------------------------------------------------------------------------------------  |
|  + Add a page or database entry                                                                         |
|                                                                                                         |
+---------------------------------------------------------------------------------------------------------+
```

#### 컴포넌트 상세 명세
1. **Top Minimal Header**:
   - 로고: 세련된 모노그램 `[N] LearnHub`.
   - 전역 퀵 커맨드: `Search or Jump to... [ ⌘ K ]`.
   - 포커스 모드 토글: 불필요한 UI를 숨기고 현재 텍스트만 남기는 노션 스타일 단축키.
2. **Knowledge Cadence Card**:
   - 알록달록한 '불꽃(Flame)' 애니메이션을 걷어내고, 학술 논문 스타일의 수치 표기 (`Active Inquiries: 8 consecutive days`).
   - GitHub 스타일의 **Monochrome Density Matrix (4단계 명도 그리드)**로 학습의 성실성과 깊이를 시각화.
3. **Continue Inquiry List**:
   - 카드 형태가 아닌, 노션의 **Inline List Item** 형태. 호버 시에만 오른쪽 `[ Resume Reading ⏎ ]` 버튼과 테두리가 은은하게 하이라이트.
4. **Knowledge Database (Table View)**:
   - 노션의 Table Database UI를 그대로 차용. 열(Column) 헤더를 클릭하여 정렬/필터링 가능.

---

### 화면 2: 교과목 학습 뷰어 (Block-based Reading & AI Dialogue Experience)
- **컨셉**: 'e-러닝 플레이어'가 아닌, **'깊은 사유를 유도하는 마크다운 문서 + 연구 조교(AI Assistant)'**.
- **주요 기능**: 블록형 타이포그래피 본문, 인라인 각주/참조, 키보드 인터랙션, 스플릿 AI 리서처 드로어.

```text
+---------------------------------------------------------------------------------------------------------+
| [← Back to Index]   Distributed Systems / 03. Raft Consensus / § 3.2 Leader Election     [Aa] [···] [ ✕ ]|
| Reading Progress: ━━━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 45% (Estimated remaining: 7 min) |
+---------------------------------------------------------------------------------------------------------+
| [ MAIN EDITORIAL CANVAS (Max-width: 760px) ]            | [ AI RESEARCH COMPANION (Split Drawer) ]      |
|                                                         |                                               |
| ⬡ Distributed Systems Architecture                      | ✦ AI Research Partner (Context Aware)         |
| # Leader Election in Raft                               | Active Focus: Section 3.2 (Heartbeat Timer)   |
|                                                         | --------------------------------------------- |
| *Published in Systems Track • 12 min read • Mastered: No*|                                               |
|                                                         | [Q] "왜 리더 하트비트 타이머는 랜덤하게          |
| In a Raft cluster, consensus begins with the election   |      설정해야 하는가?"                         |
| of a distinguished leader. The leader accepts log       |                                               |
| entries from clients, replicates them across peers,     | [A] 스플릿 브레인(Split-vote)을 방지하기 위함  |
| and manages the progression of the state machine.       | 입니다. 만약 모든 노드가 동일한 타임아웃      |
|                                                         | (예: 150ms)을 가진다면, 여러 노드가 동시에     |
| > [!DEFINITION] Split-Vote Condition                    | 후보자(Candidate)로 전환되어 표가 동등하게    |
| > When multiple nodes simultaneously transition to      | 분산되고, 선거가 무한히 실패할 수 있습니다.   |
| > candidate state, votes may divide equally, resulting  |                                               |
| > in an indecisive election cycle.                      | --------------------------------------------- |
|                                                         | [ Socratic Probe: 스스로 검증해보기 ]          |
| ```rust                                                 | 만약 네트워크 파티션이 발생해 5개 노드 중     |
| pub enum NodeRole {                                     | 2개 노드만 고립된다면, 해당 2개 노드의         |
|     Follower { leader_id: Option<NodeId> },             | 하트비트 타이머는 어떻게 반응할까요?           |
|     Candidate { term: u64, votes_received: usize },     |                                               |
|     Leader { next_index: HashMap<NodeId, u64> },        | [ Type response or press '/' for commands... ] |
| }                                                       | [ Submit Answer ⏎ ]                           |
| ```                                                     |                                               |
|                                                         | --------------------------------------------- |
| [Interactive Checkpoint Block]                          | Relevant References:                          |
| ▣ Exercise 3.2.1: Term increments during election       | • Ongaro & Ousterhout (2014) § 5.2            |
|                                                         | • Paxos vs Raft Trade-offs (p. 7)             |
| Which condition guarantees election safety?             |                                               |
| [ ] A. At least 1/3 of the cluster votes affirmative    | [ Close Assistant ( ⌘ \ ) ]                   |
| [X] B. Strict majority (Quorum: floor(N/2) + 1)         +-----------------------------------------------+
| [ ] C. Unanimous consent of all reachable nodes         |
|                                                         |
| [ Mark Chapter Complete & Archive [ ⇧ ⏎ ] ]             |
|                                                         |
+---------------------------------------------------------+
```

#### 컴포넌트 상세 명세
1. **Reading Navigation Bar**:
   - 상단 헤어라인에 슬림한 진행률 바(Reading Progress Bar).
   - 우측 `[Aa]` 버튼 클릭 시 Notion처럼 글꼴 변경 (`Default Sans` / `Serif` / `Mono`) 및 글자 크기(`Small text`) 토글.
2. **Block-based Content Area**:
   - Notion 고유의 블록(Block) 단위 호버 효과: 마우스를 올리면 왼쪽에 미세한 드래그 핸들(`⋮⋮`)과 플러스(`+`) 아이콘 노출.
   - 콜아웃 블록: 좌측에 2px의 단색 보더(`border-l-2 border-[#2F3437]`)와 옅은 배경(`bg-[#F7F6F3]`).
   - 코드 블록: JetBrains Mono 서체, 다크 모노크롬 박스.
3. **AI Research Companion (우측 분할 드로어)**:
   - 플로팅 챗봇 버튼이나 캐릭터 얼굴이 아님.
   - 학술적인 `Split-screen Drawer` 형태로 열리며, 본문에서 드래그한 문장을 즉시 인용(`"Quote"`)하여 질문하거나, AI가 본문 내용을 바탕으로 사용자에게 소크라테스식 질문(Socratic Probe)을 던져 지적 깊이를 검증.
   - 단축키 `⌘ \` 로 열고 닫을 수 있는 완벽한 키보드 플로우.

---

### 화면 3: 지식 트리 / 숙련도 시각화 화면 (Knowledge Graph & Mastery Atlas)
- **컨셉**: 'RPG 스킬 트리'가 아닌, **'지식의 성좌도(Knowledge Constellation & Atlas)'이자 '옵시디언(Obsidian) 스타일의 연결망'**.
- **주요 기능**: 개념 간의 선후 관계(Prerequisite), 4단계 인지 상태(Cognitive State), 세부 개념 인스펙터 패널.

```text
+---------------------------------------------------------------------------------------------------------+
| [N] LearnHub   Knowledge Graph / Domain: Computer Science                         Views: [ Graph | List | Matrix ]
+---------------------------------------------------------------------------------------------------------+
|  SEARCH NODES: [ Filter concepts... ( ⌘ F ) ]        ZOOM: [ - ] 100% [ + ]    COLOR: [ Monochrome Retention ]
|---------------------------------------------------------------------------------------------------------|
|                                                                                                         |
|                                     [ Distributed Storage ]                                             |
|                                            (○ 15%)                                                      |
|                                              /                                                          |
|                                             / (requires)                                                |
|                                            v                                                            |
|          [ Consensus Algorithms ] ---------> [ Raft Protocol ] <--------- [ Paxos Protocol ]            |
|               (● 95% Internalized)             (◐ 68% Synthesized)          (○ 20% Encountered)          |
|                     ^                                  |                                                |
|                     |                                  | (builds upon)                                  |
|                     |                                  v                                                |
|          [ State Machine Replication ]        [ Leader Election ]                                       |
|               (● 100% Mastered)                     (◐ 75%)                                             |
|                     ^                                                                                   |
|                     |                                                                                   |
|          [ Logical Clocks (Lamport) ]                                                                   |
|               (● 90%)                                                                                   |
|                                                                                                         |
|---------------------------------------------------------------------------------------------------------|
| [ SELECTED CONCEPT INSPECTOR (Bottom or Right Flyout) ]                                                 |
|                                                                                                         |
| CONCEPT: Raft Protocol                                      STAGE: Synthesized (68% Retention)          |
| Type: Algorithmic Primitive  •  Domain: Distributed Systems   Status: Review Due in 2 Days              |
|                                                                                                         |
| • Prerequisites: State Machine Replication [●], Logical Clocks [●]                                      |
| • Unlocks: Distributed Storage Systems [○], Byzantine Fault Tolerance [○]                              |
|                                                                                                         |
| Retention Decay Curve (Ebbinghaus):                                                                     |
| 100% ────╮                                                                                              |
|  80%     ╰───────────╮                                                                                  |
|  60%                 ╰─ ● [Current: 68%] ──-> Optimal review window: Tomorrow                           |
|                                                                                                         |
| [ Immediate Spaced Review (5 Questions) ⏎ ]        [ Open Full Reading Page ↗ ]                         |
+---------------------------------------------------------------------------------------------------------+
```

#### 컴포넌트 상세 명세
1. **View Mode Selector**:
   - `[ Graph View ]`: 개념들이 선후수 관계 엣지(Edge)로 연결된 모노크롬 네트워크 토폴로지.
   - `[ List View ]`: 노션의 계층형 토글(Toggle List) 아웃라이너.
   - `[ Matrix View ]`: 도메인 x 숙련도 2차원 그리드 테이블.
2. **Monochrome Node Representation (성좌도 메타포)**:
   - `○` (Outline Circle): `Encountered` (1~30%) - 개념을 처음 접함.
   - `◐` (Half-filled Circle): `Comprehended / Synthesized` (31~85%) - 원리를 이해하고 문제를 풀 수 있음.
   - `●` (Filled Solid Black): `Internalized` (86~100%) - 장기 기억에 정착되어 응용 가능.
   - 엣지(Edge): 0.5px의 얇은 흑연색 실선 및 화살표.
3. **Concept Inspector Panel**:
   - 노드를 클릭하면 하단 또는 우측에서 부드럽게 나타나는 상세 정보 창.
   - 에빙하우스 망각 곡선(Retention Decay Curve)을 미니멀한 ASCII/SVG 스파크라인으로 표시하여 복습 타이밍을 과학적으로 제시.

---

## 4. UX/UI Interaction Strategy: The Notion Sensibility

### 4.1 '게이미피케이션'을 '지적 존엄성(Intellectual Dignity)'으로 전환하는 메타포
- **연속 학습(Streak)의 재해석**:
  - 듀오링고의 깜빡거리는 불꽃 이모지와 폭죽 효과는 성인의 학습에 피로감을 줍니다.
  - 이를 **"학습 케이던스(Academic Cadence)"**와 **"지식 덴시티 맵(Density Heatmap)"**으로 변경합니다.
  - 카피라이팅 역시 유치한 축하 문구 대신 차분한 학술적 톤을 유지합니다.  
    *(예: "300 XP 획득! 대단해요!" → "개념 3개가 장기 기억 저장소로 전환되었습니다.")*
- **숙련도(Mastery)의 재해석**:
  - 100점 만점 수치나 레벨업(Lv.9) 대신, 인지과학의 블룸 텍소노미(Bloom's Taxonomy)를 차용한 **4단계 인지 상태(Cognitive Stages)**를 부여합니다:
    1. **Encountered (탐색)**: 용어와 기본 정의를 읽음.
    2. **Comprehended (이해)**: 맥락과 작동 기제를 파악함.
    3. **Synthesized (종합)**: 다른 개념과의 연결점을 설명하고 문제를 해결함.
    4. **Internalized (내재화)**: 완전히 체화되어 망각 주기가 수개월 단위로 연장됨.

### 4.2 Keyboard-First & Slash Command (`/`) UX
노션과 리니어(Linear)의 핵심 UX는 마우스 없이도 모든 학습 흐름을 제어할 수 있는 키보드 중심 환경입니다.
- **Global Command Palette (`⌘ K` / `Ctrl K`)**:
  - 언제 어디서든 원하는 과목, 개념 노트, 복습 세션으로 즉시 이동.
- **Slash Commands (`/`) in Reader & Notes**:
  - 학습 중 본문이나 메모 영역에서 `/`를 누르면 메뉴 팝오버 노출:
    - `/ai-explain`: 선택 영역 심화 설명 요청
    - `/quiz`: 해당 단락 즉석 복습 퀴즈 생성
    - `/summarize`: 핵심 3줄 요약 블록 삽입
    - `/katex`: 수학 수식 블록 삽입
- **Focus Mode (`F` or `⌘ .`)**:
  - 상단 내비게이션과 모든 부가 컨트롤을 Fade-out 처리하여 순수 텍스트와 타이포그래피만 남기는 극강의 몰입 모드.

### 4.3 Subdued Micro-Interactions
- **Zero-Bounce Philosophy**:
  - 튀어오르는 바운스 애니메이션, 쉐이크, 화려한 스케일 업 효과를 0%로 통제합니다.
  - 모든 트랜지션은 `120ms ~ 180ms ease-out`의 아주 미세한 불투명도(Opacity) 변화 및 배경색 전환으로 처리됩니다.
- **Thoughtful Feedback**:
  - 퀴즈 정답 시: 경쾌한 게임 효과음 대신, 체크박스가 단정한 솔리드 블랙으로 채워지고 정답 해설이 부드럽게 펼쳐집니다.
  - 퀴즈 오답 시: 빨간색 경고창 대신, "재고가 필요한 논리입니다 (Socratic Hint 제공)"라는 담담한 피드백이 표시됩니다.

---

## 5. Implementation Guide for Engineering Team (CSS & Tailwind Tokens)

```css
/* Notion-inspired Monochrome Design Tokens */
:root {
  /* Canvas & Surfaces */
  --bg-canvas: #ffffff;
  --bg-subtle: #fbfbfa;
  --bg-surface: #f7f6f3;
  --bg-hover: #efefed;
  
  /* Borders */
  --border-hairline: #e9e9e7;
  --border-medium: #d3d3d0;
  --border-strong: #2f3437;
  
  /* Text */
  --text-primary: #2f3437;
  --text-secondary: #787774;
  --text-tertiary: #9b9a97;
  
  /* Accent */
  --accent-black: #191919;
  --accent-ai-tint: rgba(110, 86, 207, 0.08);
  --accent-ai-text: #6e56cf;
}

/* Typography Classes */
.font-editorial-serif {
  font-family: 'Newsreader', 'Charter', 'Georgia', serif;
}

.font-ui-sans {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif;
}

.font-code-mono {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
}
```

---
*Reported by Product UI/UX & Brand Director for LearnHub*
