(function () {
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function itemHtml(r) {
    return `
      <li data-id="${r.id}">
        <div class="post-title">${escapeHtml(r.name)}</div>
        <div class="post-content">📞 ${escapeHtml(r.phone)}<br />🏠 ${escapeHtml(r.address)}</div>
        <div class="post-meta">${new Date(r.createdAt).toLocaleDateString("ko-KR")}</div>
        <div class="post-admin-actions">
          <button type="button" class="btn btn--sm btn--outline" data-delete-kit="${r.id}">삭제</button>
        </div>
      </li>`;
  }

  async function loadList() {
    const card = document.getElementById("welcomeKitAdminCard");
    const list = document.getElementById("welcomeKitList");
    if (!card || !list) return;
    if (!isAdmin()) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    try {
      const res = await fetch("/api/welcome-kit-requests", { headers: adminHeaders() });
      if (!res.ok) throw new Error("failed");
      const items = await res.json();
      if (!items.length) {
        list.innerHTML = `<li class="empty-state">아직 신청 내역이 없습니다.</li>`;
        return;
      }
      list.innerHTML = items.map(itemHtml).join("");
      list.querySelectorAll("[data-delete-kit]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("이 신청 내역을 삭제하시겠습니까?")) return;
          const res = await fetch(`/api/welcome-kit-requests/${btn.dataset.deleteKit}`, {
            method: "DELETE",
            headers: adminHeaders(),
          });
          if (!res.ok) {
            alert("삭제에 실패했습니다.");
            return;
          }
          loadList();
        });
      });
    } catch (e) {
      list.innerHTML = `<li class="empty-state">목록을 불러오지 못했습니다.</li>`;
    }
  }

  function initForm() {
    const form = document.getElementById("welcomeKitForm");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById("welcomeKitName").value.trim(),
        phone: document.getElementById("welcomeKitPhone").value.trim(),
        address: document.getElementById("welcomeKitAddress").value.trim(),
      };
      if (!payload.name || !payload.phone || !payload.address) return;

      const res = await fetch("/api/welcome-kit-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "제출에 실패했습니다.");
        return;
      }
      form.reset();
      alert("웰컴 키트 신청이 접수되었습니다.\n감사합니다!");
      loadList();
    });
  }

  document.addEventListener("layout:ready", () => {
    if (!document.getElementById("welcomeKitForm")) return;
    initForm();
    loadList();
    document.addEventListener("admin:changed", loadList);
  });
})();
