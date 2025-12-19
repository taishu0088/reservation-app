"use client";
import { supabase } from "@/lib/supabase";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";


/**
 * 長谷川 Times
 * ・車種ごとにカレンダー／予約一覧が切り替わる
 * ・ログインはユーザー＋パスワード1枠のみ（ユーザー変更で自動ログアウト）
 * ・予約重複は「同一車種」内のみ不可
 * ・現在より過去（日時）は予約不可（UI/ロジック両方で防止）
 */

type Reservation = {
  id: string;
  user: string;
  car: string;
  start: Date;
  end: Date;
  createdAt: Date;
};

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart < bEnd && aEnd > bStart;
type ReservationStatus = "upcoming" | "active" | "finished" | "expired";

const getReservationStatus = (r: Reservation, now: Date): ReservationStatus => {
  const endPlus2h = new Date(r.end);
  endPlus2h.setHours(endPlus2h.getHours() + 2);

  if (now < r.start) return "upcoming";        // 予約前
  if (now >= r.start && now <= r.end) return "active"; // 利用中
  if (now > r.end && now <= endPlus2h) return "finished"; // 終了直後
  return "expired"; // 終了から2時間以上
};

const getBgClass = (status: ReservationStatus) => {
  switch (status) {
    case "active":
      return "bg-blue-100 border-blue-400";
    case "finished":
      return "bg-gray-200 text-gray-500";
    default:
      return "bg-white";
  }
};

const newId = () => {
  const c = (globalThis as any)?.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Math.random().toString(36).slice(2);
};

export default function ReservationSystem() {
  const STORAGE_KEY = "hasegawa-times-reservations-v1";

  /* ================= ログイン ================= */
  const [currentUser, setCurrentUser] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const users: Record<string, string> = {
    けいた: "keita225",
    たいしゅう: "h0817",
    とうや: "toya03",
  };

  const handleLogin = () => {
    setIsLoggedIn(false);
    if (!currentUser || !password) return alert("ユーザーとパスワードを入力してください");
    if (!(currentUser in users)) return alert("存在しないユーザーです");
    if (users[currentUser] !== password) return alert("パスワードが違います");
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser("");
    setPassword("");
    setShowPassword(false);
  };

  /* ================= 予約 ================= */
  const cars = ["BMW 320i ツーリング (E91)", "TOYOTA ランドクルーザー300"];
  const [selectedCar, setSelectedCar] = useState(cars[0]);

  const [dateRange, setDateRange] = useState<any>({});
  const [borrowTime, setBorrowTime] = useState("10:00");
  const [returnTime, setReturnTime] = useState("12:00");

  const [reservations, setReservations] = useState<Reservation[]>([]);
  type SortMode = "start" | "created";
  const [sortMode, setSortMode] = useState<SortMode>("start");
  const [now, setNow] = useState(new Date());
  const [returningId, setReturningId] = useState<string | null>(null);


useEffect(() => {
  const timer = setInterval(() => setNow(new Date()), 1000); // ← 1秒
  return () => clearInterval(timer);
}, []);


  useEffect(() => {
  const fetchReservations = async () => {
    const { data, error } = await supabase
      .from("reservation")
      .select("*");

    if (error) {
      console.error(error);
      return;
    }

    setReservations(
      data.map((r) => ({
        id: r.id,
        user: r.user,
        car: r.car,
        start: new Date(r.start_time),
        end: new Date(r.end_time),
        createdAt: new Date(r.created_at),
      }))
    );
  };

  fetchReservations();
}, []);

  // 起動時に localStorage から予約を復元
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as any[];
      const restored: Reservation[] = parsed.map((r) => ({
        ...r,
        start: new Date(r.start),
        end: new Date(r.end),
      }));
      setReservations(restored);
    } catch (e) {
      console.error("failed to load reservations", e);
    }
  }, []);

  // 予約が変わるたびに localStorage に保存
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
    } catch (e) {
      console.error("failed to save reservations", e);
    }
  }, [reservations]);

 const filteredReservations = useMemo(
  () => reservations.filter((r) => r.car === selectedCar),
  [reservations, selectedCar]
);

const sortedReservations = useMemo(() => {
  return [...filteredReservations]
    // 当日中は表示、日を跨いだら消す
    .filter((r) => {
      const endOfDay = new Date(r.end);
      endOfDay.setHours(23, 59, 59, 999);
      return now <= endOfDay;
    })
    // 並び順切り替え
    .sort((a, b) => {
  const aActive = now >= a.start && now <= a.end;
  const bActive = now >= b.start && now <= b.end;

  // ① 利用中を最優先
  if (aActive && !bActive) return -1;
  if (!aActive && bActive) return 1;

  // ② 両方とも利用中 or 両方とも未使用 → 開始時間順
  return a.start.getTime() - b.start.getTime();
});

}, [filteredReservations, now, sortMode]);



const getDayStatus = (date: Date) => {
  // 「今日の0:00」
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // 過去日は色を出さない（= free 扱い）
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  if (target < todayStart) return "free";

  // 対象日の 0:00〜23:59:59.999
  const dayStart = new Date(target);
  const dayEnd = new Date(target);
  dayEnd.setHours(23, 59, 59, 999);

  const dayReservations = filteredReservations.filter(
    (r) => r.start <= dayEnd && r.end >= dayStart
  );

  if (dayReservations.length === 0) return "free";

  const isFull = dayReservations.some(
    (r) => r.start <= dayStart && r.end >= dayEnd
  );

  return isFull ? "full" : "partial";
};


  const handleReserve = async () => {
    const nowTs = new Date();
    if (!isLoggedIn || !dateRange?.from || !dateRange?.to) return;

    const start = new Date(dateRange.from);
    const [bh, bm] = borrowTime.split(":").map(Number);
    start.setHours(bh, bm, 0, 0);

    const end = new Date(dateRange.to);
    const [rh, rm] = returnTime.split(":").map(Number);
    end.setHours(rh, rm, 0, 0);

    if (start < nowTs) return alert("過去の日時は予約できません");
    if (end <= start) return alert("返却日時は借りる日時より後にしてください");

    if (filteredReservations.some((r) => overlaps(start, end, r.start, r.end))) {
      return alert("その車種はすでに予約があります");
    }

   const { error } = await supabase.from("reservation").insert([
  {
    user: currentUser,
    car: selectedCar,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  },
]);

if (error) {
  alert("予約の保存に失敗しました");
  return;
}

// 再読み込み
const { data } = await supabase.from("reservation").select("*");

if (data) {
  setReservations(
    data.map((r) => ({
      id: r.id,
      user: r.user,
      car: r.car,
      start: new Date(r.start_time),
      end: new Date(r.end_time),
      createdAt: new Date(r.created_at),
    }))
  );
}

  };

  /* ================= 簡易テスト（開発時のみ） ================= */
  if (process.env.NODE_ENV !== "production") {
    const a0 = new Date("2025-01-01T10:00:00");
    const a1 = new Date("2025-01-01T11:00:00");
    const a2 = new Date("2025-01-01T12:00:00");
    console.assert(overlaps(a0, a2, a1, a2) === true, "overlaps should be true");
    console.assert(overlaps(a0, a1, a1, a2) === false, "touching edges should be false");
    console.assert(overlaps(a0, a2, a0, a2) === true, "same interval should overlap");
    console.assert(
      overlaps(a0, a1, a2, new Date("2025-01-01T13:00:00")) === false,
      "separated ranges should be false"
    );
    console.assert(
      overlaps(a1, a2, a0, new Date("2025-01-01T13:00:00")) === true,
      "containment should be true"
    );
    // 追加テスト: 完全一致
    console.assert(overlaps(a0, a2, a0, a2) === true, "exact match should overlap");
  }

  /* ================= UI ================= */
  return (
    <div className="max-w-6xl mx-auto p-8 grid gap-12 bg-gradient-to-b from-yellow-50 via-white to-yellow-100 min-h-screen">
      <h1 className="text-4xl font-black italic whitespace-nowrap">長谷川 Times</h1>

      {/* ログイン */}
      <Card>
        <CardContent className="p-6 grid gap-4">
          <div className="grid gap-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold">ログイン</h2>
              {isLoggedIn ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-yellow-400 text-black">ログイン中：{currentUser}</Badge>
                  <Button variant="outline" size="sm" onClick={handleLogout}>
                    ログアウト
                  </Button>
                </div>
              ) : (
                <Badge variant="secondary">未ログイン</Badge>
              )}
            </div>

            <select
              value={currentUser}
              onChange={(e) => {
                setCurrentUser(e.target.value);
                setIsLoggedIn(false);
                setPassword("");
                setShowPassword(false);
              }}
            >
              <option value="">ユーザー選択</option>
              {Object.keys(users).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="パスワード"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border-2 border-yellow-400 rounded-xl px-3 py-2 pr-16 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded-md border border-yellow-400 bg-white hover:bg-yellow-100"
                aria-label={showPassword ? "パスワードを非表示" : "パスワードを表示"}
              >
                {showPassword ? "非表示" : "表示"}
              </button>
            </div>

            <Button onClick={handleLogin}>ログイン</Button>
          </div>
        </CardContent>
      </Card>

      {/* 予約 */}
      <Card>
        <CardContent className="p-6 grid gap-4">
          <h2 className="font-bold">予約</h2>

          <select value={selectedCar} onChange={(e) => setSelectedCar(e.target.value)}>
            {cars.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <div className="flex justify-center">🟡 一部空き　🔴 満車</div>

       <div className="flex justify-center">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={(range) => {
              setDateRange(range ?? {});
            }}
            disabled={(date) => {
              const todayStart = new Date();
              todayStart.setHours(0, 0, 0, 0);
              return date < todayStart;
            }}
            modifiers={{
              past: (date) => {
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                return date < todayStart; // ← 今日より前
              },
              start: (d) =>
                !!dateRange?.from && d.toDateString() === dateRange.from.toDateString(),
              end: (d) => !!dateRange?.to && d.toDateString() === dateRange.to.toDateString(),
              range: (d) => {
                if (!dateRange?.from || !dateRange?.to) return false;
                const ds = new Date(d);
                ds.setHours(0, 0, 0, 0);
                const fs = new Date(dateRange.from);
                fs.setHours(0, 0, 0, 0);
                const ts = new Date(dateRange.to);
                ts.setHours(0, 0, 0, 0);
                return ds > fs && ds < ts;
              },
              full: (d) => getDayStatus(d) === "full",
              partial: (d) => getDayStatus(d) === "partial",
            }}
            modifiersClassNames={{
              start: "bg-blue-600 text-white",
              end: "bg-green-600 text-white",
              range: "bg-blue-100",
              full: "bg-red-400 text-white",
              partial: "bg-yellow-300",
              past: "bg-transparent text-gray-400 pointer-events-none",
            }}
          />
        </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="time"
              value={borrowTime}
              onChange={(e) => setBorrowTime(e.target.value)}
            />
            <input
              type="time"
              value={returnTime}
              onChange={(e) => setReturnTime(e.target.value)}
            />
          </div>

          <Button disabled={!isLoggedIn} onClick={handleReserve}>
            予約する
          </Button>
        </CardContent>
      </Card>

   {/* 予約一覧 */}
<Card>
  <CardContent className="p-6 grid gap-3">
    <h2 className="font-bold">予約一覧（{selectedCar}）</h2>

    {sortedReservations.length === 0 && <p>予約はありません</p>}

    {sortedReservations.map((r) => {
      const isBefore = now < r.start;
      const isActive = now >= r.start && now <= r.end;
      const isReturning = returningId === r.id;
      const isFinished = isReturning || now > r.end;


      return (
       

<div
  key={r.id}
  className={`border p-3 rounded flex justify-between items-center transition-colors
    ${isReturning ? "bg-gray-200 text-gray-500" : ""}
    ${!isReturning && isActive ? "bg-green-200 border-green-400" : ""}
    ${!isReturning && isFinished ? "bg-gray-200 text-gray-500" : ""}
  `}
>


          <div>
            <p>利用者：{r.user}</p>
           <p>
  {r.start.toLocaleDateString()} {r.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
  {" ～ "}
  {r.end.toLocaleDateString()} {r.end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
</p>

            {isReturning && (
              <p className="text-sm text-gray-600">返却中…</p>
            )}

            {isActive && (
              <p className="text-sm font-bold text-green-700">▶ 利用中</p>
            )}

            {isFinished && (
              <p className="text-sm">✓ 利用終了</p>
            )}
          </div>

          {/* 利用前：キャンセル */}
          {isLoggedIn && r.user === currentUser && isBefore && (
            <Button
              variant="destructive"
              onClick={async () => {
                await supabase.from("reservation").delete().eq("id", r.id);
                setReservations((prev) =>
                  prev.filter((x) => x.id !== r.id)
                );
              }}
            >
              キャンセル
            </Button>
          )}

          {/* 利用中：返却ボタン */}
          {isLoggedIn && r.user === currentUser && isActive && !isFinished && (
             <>
    {/* ←★ここに表示される */}
    <p className="text-xs text-yellow-700 mb-1">
      ⛽ ガソリンは満タンで返却してください
    </p>
            
<Button
  disabled={returningId === r.id}
    //背景色
 className={`px-4 py-2 rounded-xl font-bold text-white transition active:scale-95
  ${returningId === r.id ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"}
`}



  onClick={async () => {
    // ① 押した瞬間にグレー固定
    setReturningId(r.id);

    const nowDate = new Date();
    setNow(nowDate);               // ← 追加（これで即「利用中判定」が切り替わる）
    const nowIso = nowDate.toISOString();

    // ② 画面を即更新
    setReservations(prev =>
      prev.map(x =>
        x.id === r.id ? { ...x, end: nowDate } : x
      )
    );

    // ③ DB 更新
    await supabase
      .from("reservation")
      .update({ end_time: nowIso })
      .eq("id", r.id);
       // ④ 1.5秒後に返却中解除（←ここが肝）
      setTimeout(() => {
        setReturningId(null);
      }, 1000);

      }}
>
  {returningId === r.id ? "返却中..." : "返却"}
</Button>
</>
)}

        </div>
      );
    })}
  </CardContent>
</Card>


    </div>
  );
}

