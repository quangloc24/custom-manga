// ===== Custom List Modal System =====

const listModal = document.getElementById("listModal");
const closeListModalBtn = document.getElementById("closeListModal");
const cancelListsBtn = document.getElementById("cancelListsBtn");
const saveListsBtn = document.getElementById("saveListsBtn");
const createListBtn = document.getElementById("createListBtn");
const newListInput = document.getElementById("newListInput");
const listItemsContainer = document.getElementById("listItemsContainer");

let userLists = {};
let selectedLists = new Set();
let currentMangaLists = new Set();

// Fetch user's custom lists
async function fetchUserLists() {
  if (!auth.currentUser) return;

  try {
    const response = await fetch(
      `/api/user/${auth.currentUser.username}/lists`,
    );
    const data = await response.json();
    if (data.success) {
      userLists = data.lists || {};
      // Find which lists contain this manga
      currentMangaLists.clear();
      for (const [listName, mangaIds] of Object.entries(userLists)) {
        if (mangaIds.includes(mangaId)) {
          currentMangaLists.add(listName);
        }
      }
      selectedLists = new Set(currentMangaLists);
    }
  } catch (error) {
    console.error("Error fetching lists:", error);
  }
}

// Render list items in modal
function renderLists() {
  const listCount = Object.keys(userLists).length;

  if (listCount === 0) {
    listItemsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📚</div>
                <p class="empty-state-text">No lists yet. Create your first list above!</p>
            </div>
        `;
    return;
  }

  let html = "";
  for (const [listName, mangaIds] of Object.entries(userLists)) {
    const count = mangaIds.length;
    const isSelected = selectedLists.has(listName);

    html += `
            <div class="list-item ${isSelected ? "selected" : ""}" data-list-name="${listName}">
                <div class="list-checkbox"></div>
                <span class="list-name">${listName}</span>
                <span class="list-count">${count} manga</span>
                <button class="list-delete" data-list-name="${listName}" title="Delete list">🗑️</button>
            </div>
        `;
  }

  listItemsContainer.innerHTML = html;

  // Add click handlers
  const listItems = listItemsContainer.querySelectorAll(".list-item");
  listItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.classList.contains("list-delete")) return;

      const listName = item.dataset.listName;
      if (selectedLists.has(listName)) {
        selectedLists.delete(listName);
        item.classList.remove("selected");
      } else {
        selectedLists.add(listName);
        item.classList.add("selected");
      }
    });
  });

  // Add delete handlers
  const deleteButtons = listItemsContainer.querySelectorAll(".list-delete");
  deleteButtons.forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const listName = btn.dataset.listName;

      if (confirm(`Delete list "${listName}"? This cannot be undone.`)) {
        const response = await fetch("/api/user/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: auth.currentUser.username,
            action: "delete",
            listName: listName,
          }),
        });

        const result = await response.json();
        if (result.success) {
          delete userLists[listName];
          selectedLists.delete(listName);
          currentMangaLists.delete(listName);
          renderLists();
          toast.success(`Deleted list: ${listName}`);
        } else {
          toast.error(`Error: ${result.error}`);
        }
      }
    });
  });
}

// Open modal
addToListBtn.addEventListener("click", async () => {
  await fetchUserLists();
  renderLists();
  listModal.classList.add("active");
});

// Close modal
function closeModal() {
  listModal.classList.remove("active");
  newListInput.value = "";
}

closeListModalBtn.addEventListener("click", closeModal);
cancelListsBtn.addEventListener("click", closeModal);

// Close on overlay click
listModal.addEventListener("click", (e) => {
  if (e.target === listModal) {
    closeModal();
  }
});

// Create new list
createListBtn.addEventListener("click", async () => {
  const listName = newListInput.value.trim();
  if (!listName) {
    toast.warning("Please enter a list name");
    return;
  }

  if (userLists[listName]) {
    toast.warning("A list with this name already exists");
    return;
  }

  const response = await fetch("/api/user/list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: auth.currentUser.username,
      action: "create",
      listName: listName,
    }),
  });

  const result = await response.json();
  if (result.success) {
    userLists[listName] = [];
    selectedLists.add(listName); // Auto-select the new list
    newListInput.value = "";
    renderLists();
    toast.success(`Created list: ${listName}`);
  } else {
    toast.error(`Error: ${result.error}`);
  }
});

// Enter key to create list
newListInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    createListBtn.click();
  }
});

// Save changes
saveListsBtn.addEventListener("click", async () => {
  // Determine which lists to add/remove
  const listsToAdd = [...selectedLists].filter(
    (list) => !currentMangaLists.has(list),
  );
  const listsToRemove = [...currentMangaLists].filter(
    (list) => !selectedLists.has(list),
  );

  // Add to lists
  for (const listName of listsToAdd) {
    await fetch("/api/user/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: auth.currentUser.username,
        action: "add",
        listName: listName,
        mangaId: mangaId,
      }),
    });
  }

  // Remove from lists
  for (const listName of listsToRemove) {
    await fetch("/api/user/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: auth.currentUser.username,
        action: "remove",
        listName: listName,
        mangaId: mangaId,
      }),
    });
  }

  // Update displayed lists
  await fetchUserLists();
  updateListDisplay();

  closeModal();

  // Show toast notification
  if (listsToAdd.length > 0 || listsToRemove.length > 0) {
    const msg = `Updated! +${listsToAdd.length} added, -${listsToRemove.length} removed`;
    toast.success(msg);
  }
});

// Display current lists on page
function updateListDisplay() {
  const customListSection = document.querySelector(".custom-list-section");
  if (!customListSection) return;

  // Remove existing display if any
  let display = customListSection.querySelector(".current-lists-display");
  if (!display) {
    display = document.createElement("div");
    display.className = "current-lists-display";
    customListSection.insertBefore(display, customListSection.firstChild);
  }

  if (currentMangaLists.size === 0) {
    display.innerHTML = "";
    return;
  }

  const listNames = [...currentMangaLists]
    .map((name) => `<span class="list-badge">${name}</span>`)
    .join("");
  display.innerHTML = `<div class="lists-label">📋 In lists:</div>${listNames}`;
}

// Initialize list display on page load
if (auth.currentUser) {
  fetchUserLists().then(updateListDisplay);
}
