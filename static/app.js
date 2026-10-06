const $ = (s) => document.querySelector(s);
const fmt = (k) => "$" + Math.round(k * 1000).toLocaleString("en-US");

let info, inputs = {};
let statsData = null;
let currentPredictedPrice = 22.5;

// Chart.js 인스턴스 전역 변수
let comparisonChart = null;
let roomsChart = null;
let distChart = null;

async function init() {
  info = await (await fetch("/api/model")).json();
  document.querySelectorAll(".field").forEach(buildField);
  setDefaults();

  const m = info.metrics;
  $("#stat-r2").textContent = `R² ${m.r2}`;
  $("#metrics").textContent = `머신러닝 성능: 검증 데이터 ${m.n_test}건 기준 결정계수 R² ${m.r2}, 평균제곱근오차(RMSE) 약 ±$${Math.round(m.rmse * 1000).toLocaleString("en-US")}`;

  await loadStats();
  await predict(); // 최초 로드시 기본 예측 수행 및 차트 렌더링
  loadHistory();
}

function buildField(el) {
  const k = el.dataset.key, r = info.ranges[k], step = el.dataset.step;
  el.innerHTML = `
    <div class="row">
      <label for="n-${k}">${el.dataset.label}</label>
      <input type="number" id="n-${k}" min="${r.min}" max="${r.max}" step="${step}">
    </div>
    <input type="range" id="r-${k}" min="${r.min}" max="${r.max}" step="${step}" aria-label="${el.dataset.label}">
  `;
  const n = $(`#n-${k}`), s = $(`#r-${k}`);
  n.addEventListener("input", () => { 
    s.value = n.value; 
    onFieldChange();
  });
  s.addEventListener("input", () => { 
    n.value = s.value; 
    onFieldChange();
  });
  inputs[k] = n;
}

// 입력값 변경 시 실시간 반영 (디바운스)
let debounceTimer = null;
function onFieldChange() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    predict(false); // 부드러운 예측 업데이트 (히스토리 저장 없이)
  }, 120);
}

function setDefaults() {
  for (const k in inputs) {
    const v = info.ranges[k].median;
    inputs[k].value = v; 
    $(`#r-${k}`).value = v;
  }
  $("#chas").checked = false;
  predict(false);
}

async function predict(saveHistory = true) {
  const body = { chas: $("#chas").checked ? 1 : 0 };
  for (const k in inputs) body[k] = parseFloat(inputs[k].value);

  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) { return; }

    currentPredictedPrice = data.price;
    const p = $("#price");
    p.textContent = fmt(data.price);
    if (saveHistory) {
      p.classList.remove("pop"); 
      void p.offsetWidth; 
      p.classList.add("pop");
      loadHistory();
    }

    // 보스턴 평균 대비 분석 태그 업데이트
    if (statsData) {
      const diff = currentPredictedPrice - statsData.avg;
      const pct = ((diff / statsData.avg) * 100).toFixed(1);
      const tag = $("#diff-badge");
      if (diff > 0.05) {
        tag.className = "diff-tag up";
        tag.textContent = `보스턴 전체 평균($${Math.round(statsData.avg*1000).toLocaleString()}) 대비 +${fmt(diff)} (+${pct}%) 높음 ▲`;
      } else if (diff < -0.05) {
        tag.className = "diff-tag down";
        tag.textContent = `보스턴 전체 평균($${Math.round(statsData.avg*1000).toLocaleString()}) 대비 -${fmt(Math.abs(diff))} (${pct}%) 낮음 ▼`;
      } else {
        tag.className = "diff-tag";
        tag.textContent = `보스턴 전체 평균 수준과 동일한 가격대`;
      }
    }

    // 차트 실시간 갱신
    updateCharts(Math.round(body.rm));
  } catch(e) {
    console.error(e);
  }
}

async function loadStats() {
  statsData = await (await fetch("/api/stats")).json();

  $("#stat-avg").textContent = fmt(statsData.avg);
  if (statsData.by_chas && statsData.by_chas.length > 1) {
    const chasAvg = statsData.by_chas.find(c => c.chas === 1)?.avg_price || 28.4;
    $("#stat-chas").textContent = fmt(chasAvg);
  }

  initComparisonChart();
  initRoomsChart();
  initDistChart();
}

// 1. 보스턴 평균 vs 내 예측값 비교 가로 막대 차트
function initComparisonChart() {
  const ctx = document.getElementById("comparisonChart");
  if (!ctx) return;

  const normalAvg = statsData.by_chas?.find(c => c.chas === 0)?.avg_price || 22.1;
  const riverAvg = statsData.by_chas?.find(c => c.chas === 1)?.avg_price || 28.4;

  comparisonChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["보스턴 전체 평균", "일반 지역 평균", "찰스강변 평균", "내 예측 집값 ✨"],
      datasets: [{
        label: "집값 (단위: $1,000)",
        data: [statsData.avg, normalAvg, riverAvg, currentPredictedPrice],
        backgroundColor: [
          "rgba(148, 163, 184, 0.45)",  // 전체 평균 (그레이)
          "rgba(56, 189, 248, 0.55)",   // 일반 지역 (스카이블루)
          "rgba(245, 158, 11, 0.65)",   // 찰스강변 (앰버/골드)
          "rgba(45, 212, 191, 0.95)"    // 내 예측값 (민트/아쿠아 하이라이트)
        ],
        borderColor: [
          "#94a3b8",
          "#38bdf8",
          "#f59e0b",
          "#2dd4bf"
        ],
        borderWidth: 2,
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` 평균가: ${fmt(ctx.raw)} (${ctx.raw}k $)`
          }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: { 
            color: "#8b9ea5",
            callback: (v) => "$" + v + "k"
          }
        },
        y: {
          grid: { display: false },
          ticks: { color: "#f0f6f8", font: { weight: "600", family: "Pretendard" } }
        }
      }
    }
  });
}

// 2. 방 개수(RM)별 평균 집값 추이 라인 + 바 복합 차트
function initRoomsChart() {
  const ctx = document.getElementById("roomsChart");
  if (!ctx) return;

  const labels = statsData.by_rooms.map(r => `${r.rooms}개`);
  const avgs = statsData.by_rooms.map(r => r.avg_price);

  roomsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          type: "line",
          label: "평균 집값 추세선",
          data: avgs,
          borderColor: "#f59e0b",
          backgroundColor: "#f59e0b",
          borderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.35,
          yAxisID: "y"
        },
        {
          type: "bar",
          label: "방 개수별 평균가",
          data: avgs,
          backgroundColor: statsData.by_rooms.map(r => 
            Math.round(parseFloat(inputs["rm"]?.value || 6)) === r.rooms 
              ? "rgba(45, 212, 191, 0.85)" 
              : "rgba(34, 55, 64, 0.65)"
          ),
          borderColor: statsData.by_rooms.map(r => 
            Math.round(parseFloat(inputs["rm"]?.value || 6)) === r.rooms 
              ? "#2dd4bf" 
              : "rgba(255,255,255,0.1)"
          ),
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: "y"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: "#8b9ea5", boxWidth: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#8b9ea5" }
        },
        y: {
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: { 
            color: "#8b9ea5",
            callback: (v) => "$" + v + "k"
          }
        }
      }
    }
  });
}

// 3. 가격대별 분포 도넛 차트
function initDistChart() {
  const ctx = document.getElementById("distChart");
  if (!ctx || !statsData.distribution) return;

  const labels = statsData.distribution.map(d => d.bucket);
  const counts = statsData.distribution.map(d => d.cnt);

  distChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
        data: counts,
        backgroundColor: [
          "rgba(244, 63, 94, 0.75)",   // 저가
          "rgba(56, 189, 248, 0.75)",  // 중하위
          "rgba(45, 212, 191, 0.85)",  // 중상위
          "rgba(245, 158, 11, 0.85)"   // 고가
        ],
        borderColor: "#14232a",
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: { color: "#cbd5e1", boxWidth: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw}개 지역 (${((ctx.raw/statsData.count)*100).toFixed(1)}%)`
          }
        }
      },
      cutout: "62%"
    }
  });
}

// 차트 데이터 실시간 동적 갱신
function updateCharts(currentRooms) {
  if (comparisonChart) {
    comparisonChart.data.datasets[0].data[3] = currentPredictedPrice;
    comparisonChart.update("none");
  }

  if (roomsChart && statsData) {
    roomsChart.data.datasets[1].backgroundColor = statsData.by_rooms.map(r => 
      r.rooms === currentRooms 
        ? "rgba(45, 212, 191, 0.9)" 
        : "rgba(34, 55, 64, 0.65)"
    );
    roomsChart.data.datasets[1].borderColor = statsData.by_rooms.map(r => 
      r.rooms === currentRooms ? "#2dd4bf" : "rgba(255,255,255,0.1)"
    );
    roomsChart.update("none");
  }
}

async function loadHistory() {
  const h = await (await fetch("/api/history")).json();
  if (!h || !h.length) return;
  $("#history").innerHTML = h.map(x =>
    `<li><span>방 ${x.rm}개 · 저소득 ${x.lstat}%</span><strong>${fmt(x.price)}</strong></li>`).join("");
}

$("#go").addEventListener("click", () => predict(true));
$("#reset").addEventListener("click", setDefaults);
$("#chas").addEventListener("change", onFieldChange);

init();
