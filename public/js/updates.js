(function () {
  let cachedUpdates = [];

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  }

  function itemHtml(u, admin) {
    return `
      <li data-update-id="${u.id}">
        <div class="post-meta">${formatDate(u.createdAt)}</div>
        <div class="post-content">${escapeHtml(u.content)}</div>
        ${
          admin
            ? `<div class="post-admin-actions"><button type="button" class="btn btn--sm btn--outline" data-delete-update="${u.id}">삭제</button></div>`
            : ""
        }
      </li>`;
  }

  function renderList() {
    const list = document.getElementById("updateList");
    if (!list) return;
    if (!cachedUpdates.length) {
      list.innerHTML = `<li class="empty-state">아직 등록된 소식이 없습니다.</li>`;
      return;
    }
    const admin = isAdmin();
    list.innerHTML = cachedUpdates.map((u) => itemHtml(u, admin)).join("");

    if (!admin) return;
    list.querySelectorAll("[data-delete-update]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("이 소식을 삭제하시겠습니까?")) return;
        const res = await fetch(`/api/updates/${btn.dataset.deleteUpdate}`, {
          method: "DELETE",
          headers: adminHeaders(),
        });
        if (!res.ok) {
          alert("삭제 권한이 없거나 실패했습니다.");
          return;
        }
        loadUpdates();
      });
    });
  }

  async function loadUpdates() {
    const list = document.getElementById("updateList");
    if (!list) return;
    try {
      const res = await fetch("/api/updates");
      cachedUpdates = await res.json();
      renderList();
    } catch (e) {
      list.innerHTML = `<li class="empty-state">불러오지 못했습니다.</li>`;
    }
  }

  function updateFormVisibility() {
    const form = document.getElementById("updateForm");
    if (form) form.hidden = !isAdmin();
  }

  function initForm() {
    const form = document.getElementById("updateForm");
    if (!form) return;
    updateFormVisibility();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const content = document.getElementById("updateContent").value.trim();
      if (!content) return;
      const res = await fetch("/api/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        alert("등록 권한이 없거나 실패했습니다.");
        return;
      }
      form.reset();
      loadUpdates();
    });

    document.addEventListener("admin:changed", () => {
      updateFormVisibility();
      renderList();
    });
  }

  document.addEventListener("layout:ready", () => {
    if (!document.getElementById("updateList")) return;
    initForm();
    loadUpdates();
  });
})();
