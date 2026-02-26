class Auth {
  constructor() {
    this.currentUser = null;
    this.token = null;
    this.boundDocumentClick = null;
    this.init();
  }

  init() {
    const storedUser = localStorage.getItem("manga_user");
    if (storedUser) {
      this.currentUser = JSON.parse(storedUser);
    }
    this.updateUI();
  }

  isLoggedIn() {
    return !!this.currentUser;
  }

  async register(username, password) {
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (data.success) {
        this.loginUser(data.user);
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch {
      return { success: false, error: "Network error" };
    }
  }

  async login(username, password) {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (data.success) {
        this.loginUser(data.user);
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch {
      return { success: false, error: "Network error" };
    }
  }

  loginUser(user) {
    this.currentUser = user;
    localStorage.setItem("manga_user", JSON.stringify(user));
    this.updateUI();
    window.dispatchEvent(new CustomEvent("auth:login", { detail: user }));
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem("manga_user");
    this.updateUI();
    window.dispatchEvent(new CustomEvent("auth:logout"));
    window.location.href = "/login.html";
  }

  updateUI() {
    const nav = document.querySelector(".nav");
    if (!nav) return;

    const profileMenu = nav.querySelector(".profile-menu-container");
    const loginLink = nav.querySelector(".nav-link-login");

    if (this.currentUser) {
      if (loginLink) loginLink.remove();
      if (profileMenu) profileMenu.remove();
      nav.appendChild(this.createProfileMenu());
    } else {
      if (profileMenu) profileMenu.remove();
      this.removeOutsideClickHandler();

      if (!loginLink) {
        const nextLoginLink = document.createElement("a");
        nextLoginLink.className = "nav-link nav-link-login";
        nextLoginLink.href = "login.html";
        nextLoginLink.textContent = "Login";
        nav.appendChild(nextLoginLink);
      }
    }
  }

  createProfileMenu() {
    const wrapper = document.createElement("div");
    wrapper.className = "profile-menu-container";

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "profile-toggle-btn";
    toggleBtn.type = "button";
    toggleBtn.innerHTML = `
      <span class="profile-avatar">${this.currentUser.username.charAt(0).toUpperCase()}</span>
      <span class="profile-name">${this.currentUser.username}</span>
    `;

    const dropdown = document.createElement("div");
    dropdown.className = "profile-dropdown";
    dropdown.innerHTML = `
      <div class="profile-dropdown-header">
        <div class="profile-dropdown-user">${this.currentUser.username}</div>
        <div class="profile-dropdown-sub">Personal menu</div>
      </div>
      <a class="profile-dropdown-item" href="/list.html">Your List</a>
      <a class="profile-dropdown-item" href="/favorites.html">Favorited Manga</a>
      <a class="profile-dropdown-item" href="/#readingHistorySection">History</a>
      <button class="profile-dropdown-item profile-logout-btn" type="button">Logout</button>
    `;

    toggleBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      wrapper.classList.toggle("open");
    });

    dropdown.querySelector(".profile-logout-btn")?.addEventListener("click", () => {
      this.logout();
    });

    wrapper.appendChild(toggleBtn);
    wrapper.appendChild(dropdown);
    this.setupOutsideClickHandler(wrapper);
    return wrapper;
  }

  setupOutsideClickHandler(container) {
    this.removeOutsideClickHandler();
    this.boundDocumentClick = (event) => {
      if (!container.contains(event.target)) {
        container.classList.remove("open");
      }
    };
    document.addEventListener("click", this.boundDocumentClick);
  }

  removeOutsideClickHandler() {
    if (!this.boundDocumentClick) return;
    document.removeEventListener("click", this.boundDocumentClick);
    this.boundDocumentClick = null;
  }
}

const auth = new Auth();
