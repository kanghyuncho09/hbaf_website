(function () {
  /* ---------- Tabs ---------- */
  function initTabs() {
    const buttons = document.querySelectorAll(".tab-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(btn.dataset.tab).classList.add("active");
      });
    });
  }

  /* ---------- 청소분담표 (탕비실 관리 / 고양이 케어·커피머신·테라스 식집사) ---------- */
  let cleaningData = null;

  async function loadCleaning() {
    const res = await fetch("/api/cleaning-schedule");
    cleaningData = await res.json();
    renderCleaningTables();
  }

  function renderAssignTable(elId, entries) {
    const table = document.getElementById(elId);
    table.innerHTML = `
      <tr><th>구분</th><th>담당부서</th></tr>
      ${entries.map(([label, team]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(team || "-")}</td></tr>`).join("")}
    `;
  }

  function renderCleaningTables() {
    document.getElementById("cleaningMonthLabel").textContent = `( ${cleaningData.month} )월`;
    renderAssignTable("pantryTable", Object.entries(cleaningData.pantry || {}));
    renderAssignTable("careTable", Object.entries(cleaningData.care || {}));
    const noteEl = document.getElementById("pantryNoteLabel");
    noteEl.textContent = cleaningData.pantryNote ? `* ${cleaningData.pantryNote}` : "";
  }

  function openCleaningForm() {
    document.getElementById("cleaningMonthInput").value = cleaningData.month;
    document.getElementById("pantryCatOfficeInput").value = cleaningData.pantry?.["고양이 사무실"] || "";
    document.getElementById("pantryTerraceInput").value = cleaningData.pantry?.["테라스 사무실"] || "";
    document.getElementById("pantryNoteInput").value = cleaningData.pantryNote || "";
    document.getElementById("careWeek1Input").value = cleaningData.care?.["1주차"] || "";
    document.getElementById("careWeek2Input").value = cleaningData.care?.["2주차"] || "";
    document.getElementById("careWeek3Input").value = cleaningData.care?.["3주차"] || "";
    document.getElementById("careWeek4Input").value = cleaningData.care?.["4주차"] || "";
    document.getElementById("cleaningForm").style.display = "block";
  }

  function updateCleaningAdminUI() {
    const btn = document.getElementById("editCleaningBtn");
    if (!btn) return;
    btn.style.display = isAdmin() ? "" : "none";
    if (!isAdmin()) document.getElementById("cleaningForm").style.display = "none";
  }

  function initCleaning() {
    updateCleaningAdminUI();
    document.getElementById("editCleaningBtn").addEventListener("click", openCleaningForm);
    document.getElementById("cancelCleaningBtn").addEventListener("click", () => {
      document.getElementById("cleaningForm").style.display = "none";
    });
    document.getElementById("cleaningForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        month: Number(document.getElementById("cleaningMonthInput").value),
        pantry: {
          "고양이 사무실": document.getElementById("pantryCatOfficeInput").value.trim(),
          "테라스 사무실": document.getElementById("pantryTerraceInput").value.trim(),
        },
        pantryNote: document.getElementById("pantryNoteInput").value.trim(),
        care: {
          "1주차": document.getElementById("careWeek1Input").value.trim(),
          "2주차": document.getElementById("careWeek2Input").value.trim(),
          "3주차": document.getElementById("careWeek3Input").value.trim(),
          "4주차": document.getElementById("careWeek4Input").value.trim(),
        },
      };
      const res = await fetch("/api/cleaning-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "수정에 실패했습니다.");
        return;
      }
      cleaningData = await res.json();
      renderCleaningTables();
      document.getElementById("cleaningForm").style.display = "none";
    });
  }

  /* ---------- 자유게시판 ---------- */
  let freePosts = [];

  async function loadFreePosts() {
    const res = await fetch("/api/free-posts");
    freePosts = await res.json();
    renderFreePosts();
  }

  function renderFreePosts() {
    const ul = document.getElementById("freePostList");
    if (!freePosts.length) {
      ul.innerHTML = `<li class="empty-state">등록된 게시글이 없습니다.</li>`;
      return;
    }
    ul.innerHTML = freePosts
      .map(
        (p) => `
        <li data-post-id="${p.id}">
          <div class="post-view">
            <div class="post-title">${escapeHtml(p.title)}</div>
            <div class="post-meta">${escapeHtml(p.author)} · ${formatDate(p.createdAt)}</div>
            <div class="post-content">${escapeHtml(p.content)}</div>
            ${
              isAdmin()
                ? `<div class="post-admin-actions">
                    <button type="button" class="btn btn--sm btn--outline" data-edit="${p.id}">수정</button>
                    <button type="button" class="btn btn--sm btn--outline" data-delete="${p.id}">삭제</button>
                  </div>`
                : ""
            }
          </div>
          <form class="post-edit-form" data-edit-form="${p.id}" hidden>
            <div class="form-row">
              <input type="text" value="${escapeHtml(p.title)}" data-field="title" required />
            </div>
            <div class="form-row">
              <textarea rows="3" data-field="content" required>${escapeHtml(p.content)}</textarea>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn--sm">저장</button>
              <button type="button" class="btn btn--sm btn--outline" data-cancel-edit="${p.id}">취소</button>
            </div>
          </form>
        </li>`
      )
      .join("");

    if (!isAdmin()) return;

    ul.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("이 게시글을 삭제하시겠습니까?")) return;
        const res = await fetch(`/api/free-posts/${btn.dataset.delete}`, {
          method: "DELETE",
          headers: adminHeaders(),
        });
        if (!res.ok) {
          alert("삭제 권한이 없거나 실패했습니다.");
          return;
        }
        loadFreePosts();
      });
    });

    ul.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const li = ul.querySelector(`li[data-post-id="${btn.dataset.edit}"]`);
        li.querySelector(".post-view").hidden = true;
        li.querySelector("[data-edit-form]").hidden = false;
      });
    });

    ul.querySelectorAll("[data-cancel-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const li = ul.querySelector(`li[data-post-id="${btn.dataset.cancelEdit}"]`);
        li.querySelector(".post-view").hidden = false;
        li.querySelector("[data-edit-form]").hidden = true;
      });
    });

    ul.querySelectorAll("[data-edit-form]").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = form.dataset.editForm;
        const payload = {
          title: form.querySelector('[data-field="title"]').value.trim(),
          content: form.querySelector('[data-field="content"]').value.trim(),
        };
        const res = await fetch(`/api/free-posts/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...adminHeaders() },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          alert("수정 권한이 없거나 실패했습니다.");
          return;
        }
        loadFreePosts();
      });
    });
  }

  function initFreeBoard() {
    document.getElementById("freePostForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        author: document.getElementById("postAuthor").value.trim(),
        title: document.getElementById("postTitle").value.trim(),
        content: document.getElementById("postContent").value.trim(),
      };
      await fetch("/api/free-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      document.getElementById("freePostForm").reset();
      loadFreePosts();
    });
  }

  /* ---------- 오늘의 신청곡 ---------- */
  async function loadSongs() {
    const res = await fetch("/api/song-requests");
    const songs = await res.json();
    const ul = document.getElementById("songList");
    if (!songs.length) {
      ul.innerHTML = `<li class="empty-state">오늘 등록된 신청곡이 없습니다.</li>`;
      return;
    }
    ul.innerHTML = songs
      .map(
        (s) => `
        <li>
          <div class="post-title">🎵 ${escapeHtml(s.song)}${s.artist ? " - " + escapeHtml(s.artist) : ""}</div>
          <div class="post-meta">신청자: ${escapeHtml(s.requester)} · ${formatDate(s.createdAt)}</div>
        </li>`
      )
      .join("");
  }

  function initSongRequest() {
    document.getElementById("songForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        song: document.getElementById("songTitle").value.trim(),
        artist: document.getElementById("songArtist").value.trim(),
        requester: document.getElementById("songRequester").value.trim(),
      };
      await fetch("/api/song-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      document.getElementById("songForm").reset();
      loadSongs();
    });
  }

  /* ---------- 점심 메뉴 룰렛 (전 직원 공유, 서버 저장) ---------- */
  let totalRotation = 0;
  let menuItems = [];

  async function loadMenu() {
    const res = await fetch("/api/lunch-menu");
    menuItems = await res.json();
    renderMenuList();
    drawWheel();
  }

  function drawWheel() {
    const canvas = document.getElementById("rouletteWheel");
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const center = size / 2;
    const radius = size / 2 - 4;
    const n = menuItems.length;
    if (!n) {
      ctx.clearRect(0, 0, size, size);
      return;
    }
    const sliceAngle = (2 * Math.PI) / n;
    const colors = ["#ffc700", "#212121"];

    ctx.clearRect(0, 0, size, size);

    menuItems.forEach((item, i) => {
      const start = -Math.PI / 2 + i * sliceAngle;
      const end = start + sliceAngle;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();

      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(start + sliceAngle / 2);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = colors[i % colors.length] === "#212121" ? "#ffffff" : "#212121";
      ctx.font = "bold 14px 'Noto Sans KR', sans-serif";
      ctx.fillText(item.name, radius - 14, 0);
      ctx.restore();
    });
  }

  function renderMenuList() {
    const ul = document.getElementById("menuList");
    ul.innerHTML = menuItems
      .map(
        (item) => `
        <li>
          <span>${escapeHtml(item.name)}</span>
          <button data-id="${item.id}" type="button">삭제</button>
        </li>`
      )
      .join("");
    ul.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await fetch(`/api/lunch-menu/${btn.dataset.id}`, { method: "DELETE" });
        loadMenu();
      });
    });
  }

  function initRoulette() {
    document.getElementById("menuForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("menuInput");
      const value = input.value.trim();
      if (!value) return;
      await fetch("/api/lunch-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      });
      input.value = "";
      loadMenu();
    });

    document.getElementById("spinBtn").addEventListener("click", () => {
      if (menuItems.length < 2) {
        alert("메뉴를 2개 이상 등록해주세요.");
        return;
      }
      const wheel = document.getElementById("rouletteWheel");
      const n = menuItems.length;
      const sliceAngle = 360 / n;
      const idx = Math.floor(Math.random() * n);
      const centerAngle = idx * sliceAngle + sliceAngle / 2;
      const extraSpins = 5 * 360;
      totalRotation += extraSpins + ((360 - centerAngle - (totalRotation % 360)) % 360);
      wheel.style.transform = `rotate(${totalRotation}deg)`;

      document.getElementById("rouletteResult").textContent = "";
      document.getElementById("spinBtn").disabled = true;
      setTimeout(() => {
        document.getElementById("rouletteResult").textContent = `오늘의 점심은 "${menuItems[idx].name}" 입니다!`;
        document.getElementById("spinBtn").disabled = false;
      }, 4100);
    });
  }

  /* ---------- utils ---------- */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  document.addEventListener("layout:ready", () => {
    if (!document.getElementById("tabs")) return;
    initTabs();
    initCleaning();
    initFreeBoard();
    initSongRequest();
    initRoulette();
    loadCleaning();
    loadFreePosts();
    loadSongs();
    loadMenu();

    document.addEventListener("admin:changed", () => {
      updateCleaningAdminUI();
      renderFreePosts();
    });
  });
})();
