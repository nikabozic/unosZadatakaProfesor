"use client";

import { useRef, useState } from "react";

// ----- TIPOVI ZADATAKA NA RAZINI ISPITA -----
type TaskType = "multiple-choice" | "short-answer";

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  "multiple-choice": "Zadatak s odabirom odgovora (A–D)",
  "short-answer": "Zadatak kratkog odgovora",
};

// ----- META PODACI: tekstualne zamjene -----
const TEXT_POOLS: Record<string, string[]> = {
  djecak: ["Ivan", "Marko", "Pero"],
  djevojcica: ["Ana", "Iva", "Mara"],
  voce1: ["jabuka", "krušaka", "banana"],
  voce2: ["naranči", "limuna", "grejpova"],
  pribaviti: ["kupio", "nabavio", "prikupio"],
};

type BaseQuestion = {
  id: number;
  text: string;
  raw: string;
  answer?: number;
  variables: Record<string, string | number>;
};

type GeneratedQuestion = BaseQuestion & {
  taskType: TaskType;
  options?: number[];    // za multiple-choice
  correctIndex?: number; // index točnog u options
};

type CheckResult = "correct" | "incorrect" | "empty";

type SavedTask = {
  template: string; // meta-tekst + !R=...
};

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ABCD opcije za MCQ
function generateMcqOptions(correct: number): number[] {
  const candidates = new Set<number>();
  candidates.add(correct);
  candidates.add(correct + 1);
  candidates.add(correct - 1);
  candidates.add(correct + 2);

  let opts = Array.from(candidates).filter((v) => v >= 0);
  while (opts.length < 4) {
    const extra = correct + (Math.floor(Math.random() * 5) + 3);
    if (!opts.includes(extra)) opts.push(extra);
  }
  return opts.slice(0, 4);
}

// PARSER IZRAZA IZA !R=
function computeAnswerFromTemplate(
  work: string,
  variables: Record<string, string | number>
): number | undefined {
  const m = work.match(/!R=([^!]+)/);
  if (!m) return undefined;

  let expr = m[1].trim();

  Object.entries(variables).forEach(([name, value]) => {
    if (typeof value === "number") {
      const re = new RegExp(`\\b${name}\\b`, "g");
      expr = expr.replace(re, value.toString());
    }
  });

  if (!/^[0-9+\-*/().\s]+$/.test(expr)) return undefined;

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return ${expr};`);
    const res = fn();
    if (typeof res === "number" && Number.isFinite(res)) return res;
  } catch {
    return undefined;
  }

  return undefined;
}

// GENERATOR JEDNOG ZADATKA (bez tipa)
function generateFromTemplate(template: string): BaseQuestion {
  let work = template;
  const variables: Record<string, string | number> = {};

  // tekstualni placeholdere: [%ime]
  work = work.replace(/\[%([a-zA-Z0-9_]+)\]/g, (_, name) => {
    const pool = TEXT_POOLS[name] || [name];
    const value = randomChoice(pool);
    variables[name] = value;
    return value;
  });

  // brojčani placeholderi: #X={2;9;1}
  work = work.replace(
    /#([a-zA-Z0-9_]+)=\{(\d+);(\d+);(\d+)\}/g,
    (_, name, minStr, maxStr, stepStr) => {
      const min = parseInt(minStr, 10);
      const max = parseInt(maxStr, 10);
      const step = parseInt(stepStr, 10);

      const count = Math.floor((max - min) / step) + 1;
      const idx = Math.floor(Math.random() * count);
      const value = min + idx * step;

      variables[name] = value;
      return String(value);
    }
  );

  const answer = computeAnswerFromTemplate(work, variables);
  const displayText = work.replace(/!R=.*$/, "").trim();

  return {
    id: Date.now() + Math.random(),
    text: displayText,
    raw: work,
    answer,
    variables,
  };
}

export default function Page() {
  const [template, setTemplate] = useState<string>(
    "[%djecak] je [%pribaviti] #X={2;9;1} [%voce1], a [%djevojcica] #Y={2;9;1} [%voce2]. Koliko je to voća ukupno?"
  );
  const [solutionFormula, setSolutionFormula] = useState<string>("X+Y");

  // tip ZADATKA na ISPITU (za sve zadatke)
  const [examMode, setExamMode] = useState<TaskType>("short-answer");

  const [savedTasks, setSavedTasks] = useState<SavedTask[]>([]);
  const [taskCounts, setTaskCounts] = useState<number[]>([]);

  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [studentAnswers, setStudentAnswers] = useState<string[]>([]);
  const [checkResults, setCheckResults] = useState<CheckResult[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [showSolutions, setShowSolutions] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSaveTask = () => {
    const text = template.trim();
    const formula = solutionFormula.trim();
    if (!text || !formula) return;

    const fullTemplate = `${text} !R=${formula}`;
    const newTask: SavedTask = { template: fullTemplate };

    setSavedTasks((prev) => [newTask, ...prev]);
    setTaskCounts((prev) => [0, ...prev]);
  };

  const handleGenerateExam = () => {
    const all: GeneratedQuestion[] = [];

    savedTasks.forEach((saved, i) => {
      const count = taskCounts[i] || 0;
      for (let j = 0; j < count; j++) {
        const base = generateFromTemplate(saved.template);

        if (examMode === "multiple-choice" && typeof base.answer === "number") {
          const opts = shuffle(generateMcqOptions(base.answer));
          const correctIndex = opts.findIndex((v) => v === base.answer);
          all.push({
            ...base,
            taskType: examMode,
            options: opts,
            correctIndex,
          });
        } else {
          all.push({
            ...base,
            taskType: "short-answer",
          });
        }
      }
    });

    setGeneratedQuestions(all);
    setStudentAnswers(all.map(() => ""));
    setCheckResults(all.map(() => "empty"));
    setScore(null);
  };

  const handleCheckExam = () => {
    const res: CheckResult[] = [];
    let pts = 0;
    let autoCount = 0;

    generatedQuestions.forEach((q, i) => {
      // kratki odgovor
      if (q.taskType === "short-answer") {
        autoCount++;
        const ans = studentAnswers[i]?.trim() ?? "";
        if (!ans) {
          res[i] = "empty";
          return;
        }
        const val = Number(ans.replace(",", "."));
        if (!Number.isNaN(val) && val === q.answer) {
          res[i] = "correct";
          pts++;
        } else {
          res[i] = "incorrect";
        }
        return;
      }

      // multiple-choice
      if (q.taskType === "multiple-choice" && q.options && q.correctIndex !== undefined) {
        autoCount++;
        const ans = studentAnswers[i]?.trim() ?? "";
        if (ans === "") {
          res[i] = "empty";
          return;
        }
        const idx = Number(ans);
        if (!Number.isNaN(idx) && idx === q.correctIndex) {
          res[i] = "correct";
          pts++;
        } else {
          res[i] = "incorrect";
        }
        return;
      }

      res[i] = "empty";
    });

    setCheckResults(res);
    setScore(autoCount > 0 ? pts : null);
  };

  const autoGradedCount = generatedQuestions.filter(
    (q) =>
      q.taskType === "short-answer" ||
      (q.taskType === "multiple-choice" && q.options && q.correctIndex !== undefined)
  ).length;

  return (
    <main className="min-h-screen flex justify-center p-6 bg-white text-black">
      <div className="w-full max-w-5xl p-6 space-y-10">
        {/* HEADER */}
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-black">
            Editor matematičkih zadataka
          </h1>
          <p className="text-black">
            Upiši meta-zadatak, formulu rješenja, spremi predložak i kasnije
            odaberi želiš li ispit s kratkim odgovorom ili zaokruživanjem A–D.
          </p>
        </header>

        {/* --- EDITOR --- */}
        <section className="space-y-4">
          <div className="space-y-1">
            <label className="font-semibold text-black">Tekst meta-zadatka</label>
            <textarea
              ref={textareaRef}
              className="w-full h-40 border rounded-lg p-3 font-mono text-black bg-white"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="npr. [%djecak] je [%pribaviti] #X={2;9;1} [%voce1], a [%djevojcica] #Y={2;9;1} [%voce2]. Koliko je to voća ukupno?"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {["[%djecak]", "[%djevojcica]", "[%voce1]", "[%voce2]", "[%pribaviti]"].map(
              (t) => (
                <button
                  key={t}
                  onClick={() => {
                    const el = textareaRef.current;
                    if (!el) return;
                    const start = el.selectionStart;
                    const end = el.selectionEnd;
                    const newVal =
                      template.slice(0, start) + t + template.slice(end);
                    setTemplate(newVal);
                    requestAnimationFrame(() => {
                      const pos = start + t.length;
                      el.focus();
                      el.setSelectionRange(pos, pos);
                    });
                  }}
                  className="px-3 py-1 bg-gray-200 rounded text-black text-sm"
                >
                  {t}
                </button>
              )
            )}

            {["#X={2;9;1}", "#Y={2;9;1}", "#JEDNOZNAM={1;9;1}"].map((t) => (
              <button
                key={t}
                onClick={() => {
                  const el = textareaRef.current;
                  if (!el) return;
                  const start = el.selectionStart;
                  const end = el.selectionEnd;
                  const newVal =
                    template.slice(0, start) + t + template.slice(end);
                  setTemplate(newVal);
                  requestAnimationFrame(() => {
                    const pos = start + t.length;
                    el.focus();
                    el.setSelectionRange(pos, pos);
                  });
                }}
                className="px-3 py-1 bg-teal-200 rounded text-black text-sm"
              >
                {t}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-black">Formula rješenja</label>
            <input
              type="text"
              value={solutionFormula}
              onChange={(e) => setSolutionFormula(e.target.value)}
              className="w-full border rounded-lg p-2 text-black bg-white font-mono"
              placeholder="npr. X+Y, X-Y, 2*(A+B)"
            />
          </div>

          <button
            onClick={handleSaveTask}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Spremi zadatak
          </button>
        </section>

        {/* --- SPREMLJENI --- */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-black">Spremljeni meta-zadaci</h2>

          {savedTasks.length === 0 && (
            <p className="text-black">Nema spremljenih zadataka.</p>
          )}

          <ul className="space-y-4">
            {savedTasks.map((saved, i) => {
              const [textPart, formulaPart] = saved.template.split("!R=");
              return (
                <li
                  key={i}
                  className="border p-3 rounded bg-gray-100 text-black space-y-2"
                >
                  <div className="text-xs">
                    <span className="font-semibold">Tekst:</span>{" "}
                    <span className="font-mono">
                      {textPart?.trim() ?? ""}
                    </span>
                  </div>
                  <div className="text-xs">
                    <span className="font-semibold">Formula:</span>{" "}
                    <span className="font-mono">
                      {(formulaPart ?? "").trim()}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-3 items-center text-black text-sm">
                    <div className="flex items-center gap-2">
                      <label>Broj zadataka iz ovog predloška:</label>
                      <input
                        type="number"
                        min={0}
                        value={taskCounts[i] ?? 0}
                        onChange={(e) => {
                          const updated = [...taskCounts];
                          updated[i] = Number(e.target.value);
                          setTaskCounts(updated);
                        }}
                        className="w-20 border rounded px-2 py-1 text-black bg-white"
                      />
                    </div>

                    <button
                      onClick={() => {
                        setSavedTasks((prev) =>
                          prev.filter((_, idx) => idx !== i)
                        );
                        setTaskCounts((prev) =>
                          prev.filter((_, idx) => idx !== i)
                        );
                      }}
                      className="px-2 py-1 bg-red-500 text-white text-xs rounded"
                    >
                      Obriši
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {savedTasks.length > 0 && (
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="font-semibold text-black">Tip ispita</label>
                <select
                  value={examMode}
                  onChange={(e) => setExamMode(e.target.value as TaskType)}
                  className="w-full border rounded-lg p-2 text-black bg-white"
                >
                  <option value="short-answer">
                    Zadatak kratkog odgovora
                  </option>
                  <option value="multiple-choice">
                    Zadatak s odabirom odgovora (A–D)
                  </option>
                </select>
              </div>

              <button
                onClick={handleGenerateExam}
                className="px-4 py-2 bg-green-600 text-white rounded-lg"
              >
                Generiraj ispit
              </button>
            </div>
          )}
        </section>

        {/* --- ISPIT --- */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-black">Generirani ispit</h2>
          {generatedQuestions.length > 0 && (
            <p className="text-sm text-black">
              Tip: {TASK_TYPE_LABELS[examMode]}
            </p>
          )}

          {generatedQuestions.length === 0 && (
            <p className="text-black">Nema generiranih zadataka.</p>
          )}

          {generatedQuestions.length > 0 && (
            <>
              <ol className="space-y-4 list-decimal list-inside text-black mt-2">
                {generatedQuestions.map((q, i) => {
                  const letters = ["A", "B", "C", "D"];

                  return (
                    <li
                      key={q.id}
                      className="border p-3 rounded bg-white text-black"
                    >
                      <p className="text-black">{q.text}</p>

                      {/* KRATKI ODGOVOR */}
                      {q.taskType === "short-answer" && (
                        <>
                          <input
                            type="number"
                            value={studentAnswers[i]}
                            onChange={(e) => {
                              const updated = [...studentAnswers];
                              updated[i] = e.target.value;
                              setStudentAnswers(updated);
                            }}
                            className="mt-2 w-24 border rounded px-2 py-1 text-black bg-white"
                          />

                          {checkResults[i] === "correct" && (
                            <p className="text-green-700 text-sm mt-1">
                              Točno ✓
                            </p>
                          )}
                          {checkResults[i] === "incorrect" && (
                            <p className="text-red-600 text-sm mt-1">
                              Pogrešno ✗
                            </p>
                          )}
                          {checkResults[i] === "empty" && score !== null && (
                            <p className="text-yellow-700 text-sm mt-1">
                              Nema odgovora
                            </p>
                          )}
                        </>
                      )}

                      {/* ZAOKRUŽIVANJE (A–D) */}
                      {q.taskType === "multiple-choice" &&
                        q.options &&
                        q.options.length === 4 && (
                          <div className="mt-2 space-y-1">
                            {q.options.map((opt, idx) => (
                              <label
                                key={idx}
                                className="flex items-center gap-2 text-sm"
                              >
                                <input
                                  type="radio"
                                  name={`q-${q.id}`}
                                  value={idx}
                                  checked={studentAnswers[i] === String(idx)}
                                  onChange={(e) => {
                                    const updated = [...studentAnswers];
                                    updated[i] = e.target.value;
                                    setStudentAnswers(updated);
                                  }}
                                />
                                <span>
                                  {letters[idx]}. {opt}
                                </span>
                              </label>
                            ))}

                            {checkResults[i] === "correct" && (
                              <p className="text-green-700 text-sm mt-1">
                                Točno ✓
                              </p>
                            )}
                            {checkResults[i] === "incorrect" && (
                              <p className="text-red-600 text-sm mt-1">
                                Pogrešno ✗
                              </p>
                            )}
                            {checkResults[i] === "empty" && score !== null && (
                              <p className="text-yellow-700 text-sm mt-1">
                                Nema odabranog odgovora
                              </p>
                            )}

                            {showSolutions &&
                              q.correctIndex !== undefined &&
                              q.options[q.correctIndex] !== undefined && (
                                <p className="text-green-700 text-sm mt-1">
                                  Točan odgovor:{" "}
                                  <b>
                                    {letters[q.correctIndex]}.{" "}
                                    {q.options[q.correctIndex]}
                                  </b>
                                </p>
                              )}
                          </div>
                        )}
                    </li>
                  );
                })}
              </ol>

              <div className="flex gap-3 items-center mt-4 flex-wrap">
                <button
                  onClick={handleCheckExam}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                >
                  Provjeri odgovore
                </button>

                <button
                  onClick={() => setShowSolutions(!showSolutions)}
                  className="px-4 py-2 bg-gray-300 text-black rounded-lg"
                >
                  {showSolutions ? "Sakrij rješenja" : "Prikaži rješenja"}
                </button>

                {score !== null && autoGradedCount > 0 && (
                  <p className="text-black text-lg font-semibold">
                    Rezultat: {score}/{autoGradedCount}
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
