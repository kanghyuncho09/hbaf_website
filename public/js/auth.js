(function () {
  const TOKEN_KEY = "hbaf-user-token";
  const NAME_KEY = "hbaf-user-name";

  // 모든 /api/ 요청에 로그인 토큰을 자동으로 붙여준다. 이렇게 해두면 기존의
  // meeting-room.js / vehicle.js / board.js 등 다른 파일들을 일일이 고치지 않아도
  // 로그인 후 모든 API 호출에 인증 헤더가 자동으로 실린다.
  const originalFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    if (url && url.indexOf("/api/") === 0) {
      const token = getUserToken();
      // 직원 계정 없이 관리자 비밀번호로만 들어온 경우에도 일반 화면 데이터를
      // 볼 수 있도록 관리자 토큰도 함께 실어 보낸다 (adminHeaders()가 이미 실어
      // 보낸 요청과 겹쳐도 값은 같으므로 문제 없다).
      let adminToken = null;
      try {
        adminToken = localStorage.getItem("hbaf-admin-token");
      } catch (e) {}
      init = init || {};
      init.headers = Object.assign(
        {},
        init.headers || {},
        token ? { "X-User-Token": token } : {},
        adminToken ? { "X-Admin-Token": adminToken } : {}
      );
    }
    return originalFetch(input, init);
  };

  function getUserToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function getUserName() {
    try {
      return localStorage.getItem(NAME_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function showGate() {
    // 로그인 화면을 실제로 띄워야 하는 상황이면(토큰이 없거나 무효함), 초기
    // 로딩 시 붙여둔 "일단 로그인된 것처럼 보여주기" 클래스부터 떼어낸다.
    document.documentElement.classList.remove("auth-optimistic");
    document.getElementById("authGate").hidden = false;
    document.getElementById("siteHeader").hidden = true;
    document.getElementById("mainContent").hidden = true;
    document.getElementById("siteFooter").hidden = true;
  }

  function hideGate() {
    document.getElementById("authGate").hidden = true;
    document.getElementById("siteHeader").hidden = false;
    document.getElementById("mainContent").hidden = false;
    document.getElementById("siteFooter").hidden = false;
    const greet = document.getElementById("userGreeting");
    if (greet) greet.textContent = getUserName() ? getUserName() + "님" : "";
  }

  function setMessage(id, text, isError) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "#e6544c" : "#2f9e5b";
  }

  async function checkAuth() {
    const token = getUserToken();
    if (!token) {
      // 직원 계정이 없어도 관리자 비밀번호로는 들어올 수 있게 한다.
      // (최초 회원가입 승인을 해줄 사람이 아무도 없는 상황을 막기 위함)
      if (typeof isAdmin === "function" && isAdmin()) {
        hideGate();
        startApp();
        return;
      }
      showGate();
      return;
    }
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) throw new Error("unauthorized");
      const user = await res.json();
      localStorage.setItem(NAME_KEY, user.name);
      hideGate();
      startApp();
    } catch (e) {
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(NAME_KEY);
      } catch (err) {}
      if (typeof isAdmin === "function" && isAdmin()) {
        hideGate();
        startApp();
        return;
      }
      showGate();
    }
  }

  function initForms() {
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");

    document.getElementById("showSignupBtn").addEventListener("click", (e) => {
      e.preventDefault();
      loginForm.hidden = true;
      signupForm.hidden = false;
    });
    document.getElementById("showLoginBtn").addEventListener("click", (e) => {
      e.preventDefault();
      signupForm.hidden = true;
      loginForm.hidden = false;
    });

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("loginUsername").value.trim();
      const password = document.getElementById("loginPassword").value;
      setMessage("loginMessage", "", false);
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessage("loginMessage", data.error || "로그인에 실패했습니다.", true);
          return;
        }
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(NAME_KEY, data.name);
        hideGate();
        startApp();
      } catch (err) {
        setMessage("loginMessage", "로그인 중 오류가 발생했습니다.", true);
      }
    });

    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById("signupName").value.trim(),
        username: document.getElementById("signupUsername").value.trim(),
        password: document.getElementById("signupPassword").value,
      };
      setMessage("signupMessage", "", false);
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessage("signupMessage", data.error || "가입 신청에 실패했습니다.", true);
          return;
        }
        signupForm.reset();
        setMessage("signupMessage", "가입 신청이 완료되었습니다! 관리자 승인 후 로그인할 수 있어요.", false);
      } catch (err) {
        setMessage("signupMessage", "가입 신청 중 오류가 발생했습니다.", true);
      }
    });

    document.getElementById("userLogoutBtn").addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch (err) {}
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(NAME_KEY);
      } catch (err) {}
      location.reload();
    });

    const gateAdminBtn = document.getElementById("gateAdminLoginBtn");
    if (gateAdminBtn) {
      gateAdminBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const pw = prompt("관리자 비밀번호를 입력하세요.");
        if (!pw) return;
        try {
          const res = await originalFetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: pw }),
          });
          const data = await res.json();
          if (!res.ok) {
            alert(data.error || "관리자 로그인에 실패했습니다.");
            return;
          }
          localStorage.setItem("hbaf-admin-token", data.token);
          hideGate();
          startApp();
          if (typeof updateAdminToggleUI === "function") updateAdminToggleUI();
        } catch (err) {
          alert("로그인 중 오류가 발생했습니다.");
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initForms();
    checkAuth();
  });

  window.getUserToken = getUserToken;
  window.getUserName = getUserName;
})();
