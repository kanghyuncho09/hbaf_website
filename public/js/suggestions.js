(function () {
  let notes = [];

  async function loadNotes() {
    const res = await fetch("/api/suggestions");
    notes = await res.json();
    renderWall();
  }

  function renderWall() {
    const wall = document.getElementById("stickyWall");
    if (!notes.length) {
      wall.innerHTML = `<p class="empty-state">아직 남겨진 메모가 없습니다. 첫 메모를 남겨보세요!</p>`;
      return;
    }
    const admin = isAdmin();
    wall.innerHTML = notes
      .map(
        (n, i) => `
        <div class="sticky-note sticky-note--y${i % 5}">
          ${admin ? `<button type="button" class="sticky-note__delete" data-delete-suggestion="${n.id}">✕</button>` : ""}
          <div class="sticky-note__content">${escapeHtml(n.content)}</div>
          <div class="sticky-note__meta">
            <span>${escapeHtml(n.author || "익명")}</span>
            <span>${formatDate(n.createdAt)}</span>
          </div>
        </div>`
      )
      .join("");

    if (!admin) return;
    wall.querySelectorAll("[data-delete-suggestion]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("이 메모를 삭제하시겠습니까?")) return;
        const res = await fetch(`/api/suggestions/${btn.dataset.deleteSuggestion}`, {
          method: "DELETE",
          headers: adminHeaders(),
        });
        if (!res.ok) {
          alert("삭제 권한이 없거나 실패했습니다.");
          return;
        }
        loadNotes();
      });
    });
  }

  function initForm() {
    document.getElementById("suggestionForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        author: document.getElementById("suggestionAuthor").value.trim(),
        content: document.getElementById("suggestionContent").value.trim(),
      };
      if (!payload.content) return;
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        alert("등록에 실패했습니다.");
        return;
      }
      document.getElementById("suggestionForm").reset();
      loadNotes();
    });

    document.addEventListener("admin:changed", renderWall);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  }

  document.addEventListener("layout:ready", () => {
    if (!document.getElementById("stickyWall")) return;
    initForm();
    loadNotes();
  });
})();
