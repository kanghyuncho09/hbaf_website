(function () {
  function statusBadge(status) {
    if (status === "approved") return `<span class="post-meta">✅ 승인됨</span>`;
    if (status === "rejected") return `<span class="post-meta">🚫 거절됨</span>`;
    return `<span class="post-meta">⏳ 승인 대기</span>`;
  }

  function userHtml(u) {
    const actions = [];
    if (u.status !== "approved") {
      actions.push(`<button type="button" class="btn btn--sm btn--outline" data-approve="${u.id}">승인</button>`);
    }
    if (u.status !== "rejected") {
      actions.push(`<button type="button" class="btn btn--sm btn--outline" data-reject="${u.id}">거절</button>`);
    }
    actions.push(`<button type="button" class="btn btn--sm btn--outline" data-delete="${u.id}">삭제</button>`);

    return `
      <li>
        <div class="post-title">${escapeHtml(u.name)} <span class="post-meta">(${escapeHtml(u.username)})</span></div>
        <div class="post-meta">${statusBadge(u.status)}</div>
        <div class="post-admin-actions">${actions.join("")}</div>
      </li>`;
  }

  async function loadUsers() {
    const list = document.getElementById("adminUserList");
    if (!list) return;
    if (!isAdmin()) {
      list.innerHTML = `<p class="empty-state">관리자로 로그인해야 볼 수 있습니다.</p>`;
      return;
    }
    try {
      const res = await fetch("/api/admin/users", { headers: adminHeaders() });
      if (!res.ok) throw new Error("failed");
      const users = await res.json();
      if (!users.length) {
        list.innerHTML = `<p class="empty-state">가입 신청한 직원이 없습니다.</p>`;
        return;
      }
      list.innerHTML = users.map(userHtml).join("");
      bindActions();
    } catch (e) {
      list.innerHTML = `<p class="empty-state">목록을 불러오지 못했습니다.</p>`;
    }
  }

  function bindActions() {
    const list = document.getElementById("adminUserList");
    list.querySelectorAll("[data-approve]").forEach((btn) => {
      btn.addEventListener("click", () => act(btn.dataset.approve, "approve"));
    });
    list.querySelectorAll("[data-reject]").forEach((btn) => {
      btn.addEventListener("click", () => act(btn.dataset.reject, "reject"));
    });
    list.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!confirm("이 계정을 완전히 삭제하시겠습니까?")) return;
        act(btn.dataset.delete, "delete");
      });
    });
  }

  async function act(id, action) {
    try {
      const res =
        action === "delete"
          ? await fetch(`/api/admin/users/${id}`, { method: "DELETE", headers: adminHeaders() })
          : await fetch(`/api/admin/users/${id}/${action}`, { method: "POST", headers: adminHeaders() });
      if (!res.ok) {
        alert("처리에 실패했습니다.");
        return;
      }
      loadUsers();
    } catch (e) {
      alert("처리 중 오류가 발생했습니다.");
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  document.addEventListener("layout:ready", () => {
    if (document.getElementById("adminUserList")) loadUsers();
  });
  document.addEventListener("view:changed", (e) => {
    if (e.detail && e.detail.view === "admin-users") loadUsers();
  });
  document.addEventListener("admin:changed", loadUsers);
})();
