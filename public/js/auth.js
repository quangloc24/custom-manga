class Auth {
  constructor() {
    this.currentUser = null;
    this.token = null; // In a real app, use JWT. Here we rely on username for MVP/session.
    this.init();
  }

  init() {
    // Load user from local storage
    const storedUser = localStorage.getItem("manga_user");
    if (storedUser) {
      this.currentUser = JSON.parse(storedUser);
    }
    // Always update UI (to show Login button if not logged in)
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
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
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
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
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

    // Check if profile link already exists
    let profileLink = nav.querySelector(".nav-link-profile");

    if (this.currentUser) {
      if (!profileLink) {
        profileLink = document.createElement("a");
        profileLink.className = "nav-link nav-link-profile";
        profileLink.href = "#"; // Placeholder, maybe user profile page later
        profileLink.textContent = `👤 ${this.currentUser.username}`;
        profileLink.onclick = (e) => {
          e.preventDefault();
          if (confirm("Logout?")) {
            this.logout();
          }
        };
        nav.appendChild(profileLink);
      } else {
        profileLink.textContent = `👤 ${this.currentUser.username}`;
        profileLink.style.display = "inline-block";
      }

      // Remove Login link if present
      const loginLink = nav.querySelector(".nav-link-login");
      if (loginLink) loginLink.remove();
    } else {
      // Not logged in
      if (profileLink) profileLink.remove();

      let loginLink = nav.querySelector(".nav-link-login");
      if (!loginLink) {
        loginLink = document.createElement("a");
        loginLink.className = "nav-link nav-link-login";
        loginLink.href = "login.html";
        loginLink.textContent = "Login";
        nav.appendChild(loginLink);
      }
    }
  }
}

const auth = new Auth();
