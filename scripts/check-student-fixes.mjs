const base = "http://localhost:3002";
const source = { id: "dice", title: "주사위 자료", text: "공정한 주사위의 눈은 1,2,3,4,5,6이다. 짝수가 나왔을 때 가능한 눈은 2,4,6이다. 이때 2일 확률은 1/3이다.", kind: "file", updatedAt: new Date().toISOString() };
const cases = [
  { name: "GPT tutor with high selected", path: "tutor-chat", headers: { "x-learnhub-ai-provider":"openai", "x-learnhub-ai-model":"gpt-5.6-luna", "x-learnhub-ai-reasoning":"high", "x-learnhub-ai-max-output-tokens":"8192" }, body: { mode:"free", courseTitle:"자유 학습", lessonTitle:"AI 학습 대화", conceptName:"사용자 질문", currentStepContent:"자유 대화", userQuestion:"조건부확률을 처음부터 공부하고 싶어.", history:[] } },
  { name: "Gemini course with high selected", path: "analyze-subject", headers: { "x-learnhub-ai-provider":"gemini", "x-learnhub-ai-model":"gemini-3.8-flash", "x-learnhub-ai-reasoning":"high", "x-learnhub-ai-max-output-tokens":"8192" }, body: { subject:"주사위와 카드로 배우는 조건부확률", level:"beginner", dailyMinutes:20 } },
  { name: "Exactly three quiz questions", path:"study", body: { action:"quiz", question:"첨부 자료로 문제 3개를 내줘.", sources:[source], history:[] } },
  { name: "Visual dice elimination", path:"study", body:{ action:"visual", question:"1~6 중 홀수가 제외되고 2,4,6만 남는 모습을 그려줘.", sources:[source], history:[] } },
];
for (const entry of cases.filter(c => !process.env.ONLY_START || c.path !== "study")) {
 const r=await fetch(`${base}/api/ai/${entry.path}`,{method:"POST", headers:{"Content-Type":"application/json",...entry.headers},body:JSON.stringify(entry.body)});
 const data=await r.json();
 console.log(JSON.stringify({name:entry.name,status:r.status,questions:data.questions?.length,nodes:data.diagram?.nodes,edges:data.diagram?.edges,chapters:data.chapters?.length,reply:data.reply,error:data.error}));
 if (!r.ok || (entry.path==="study" && entry.body.action==="quiz" && data.questions?.length!==3) || (entry.body.action==="visual" && !data.diagram)) process.exitCode=1;
}
