// Global State
let tasks = [];
const API_URL = '/api/tasks';

// DOM Elements
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const todoList = document.getElementById('todo-list');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');

// Stats Counters
const totalCountEl = document.getElementById('total-count');
const pendingCountEl = document.getElementById('pending-count');
const completedCountEl = document.getElementById('completed-count');

// Toast Container
const toastContainer = document.getElementById('toast-container');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  fetchTasks();
  
  // Form submit event
  todoForm.addEventListener('submit', handleAddTask);
});

// Fetch Tasks from Server
async function fetchTasks() {
  showLoading(true);
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error('Failed to fetch tasks');
    
    tasks = await response.ok ? await response.json() : [];
    renderTasks();
  } catch (error) {
    console.error('Fetch error:', error);
    showToast('Could not load tasks from server', 'error');
  } finally {
    showLoading(false);
  }
}

// Render Tasks to UI
function renderTasks() {
  todoList.innerHTML = '';
  
  if (tasks.length === 0) {
    emptyState.classList.remove('hidden');
    todoList.classList.add('hidden');
  } else {
    emptyState.classList.add('hidden');
    todoList.classList.remove('hidden');
    
    tasks.forEach(task => {
      const li = createTaskElement(task);
      todoList.appendChild(li);
    });
  }
  
  updateStats();
}

// Create Task DOM Element
function createTaskElement(task) {
  const li = document.createElement('li');
  li.className = `todo-item ${task.completed ? 'completed' : ''}`;
  li.dataset.id = task._id;
  
  li.innerHTML = `
    <div class="todo-content-wrapper">
      <label class="checkbox-container">
        <input type="checkbox" class="toggle-checkbox" ${task.completed ? 'checked' : ''}>
        <span class="checkmark"></span>
      </label>
      <span class="todo-text" title="${escapeHTML(task.title)}">${escapeHTML(task.title)}</span>
    </div>
    <div class="todo-actions">
      <button class="action-btn edit-btn" aria-label="Edit task">
        <i class="fa-regular fa-pen-to-square"></i>
      </button>
      <button class="action-btn delete-btn" aria-label="Delete task">
        <i class="fa-regular fa-trash-can"></i>
      </button>
    </div>
  `;

  // Attach Event Listeners
  const checkbox = li.querySelector('.toggle-checkbox');
  checkbox.addEventListener('change', () => handleToggleTask(task._id, checkbox.checked));

  const deleteBtn = li.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', () => handleDeleteTask(task._id, li));

  const editBtn = li.querySelector('.edit-btn');
  editBtn.addEventListener('click', () => enterEditMode(task._id, li));

  return li;
}

// Add Task Handler
async function handleAddTask(e) {
  e.preventDefault();
  const title = todoInput.value.trim();
  if (!title) return;

  // Clear input
  todoInput.value = '';

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.message || 'Failed to add task');
    }

    const newTask = await response.json();
    
    // Add to state and render
    tasks.unshift(newTask);
    renderTasks();
    showToast('Task added successfully', 'success');
  } catch (error) {
    console.error('Add task error:', error);
    showToast(error.message || 'Could not add task', 'error');
  }
}

// Toggle Complete Handler
async function handleToggleTask(id, completed) {
  // Optimistic update
  const taskIndex = tasks.findIndex(t => t._id === id);
  if (taskIndex !== -1) {
    tasks[taskIndex].completed = completed;
    const li = todoList.querySelector(`[data-id="${id}"]`);
    if (li) {
      if (completed) {
        li.classList.add('completed');
      } else {
        li.classList.remove('completed');
      }
    }
    updateStats();
  }

  try {
    const response = await fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed })
    });

    if (!response.ok) throw new Error('Failed to update status');
    
    const updatedTask = await response.json();
    
    // Update master state with server response to ensure sync
    tasks[taskIndex] = updatedTask;
    showToast(completed ? 'Task marked as completed' : 'Task marked as pending', 'info');
  } catch (error) {
    console.error('Toggle task error:', error);
    showToast('Could not update task status', 'error');
    
    // Revert optimistic update
    fetchTasks();
  }
}

// Delete Task Handler
async function handleDeleteTask(id, liElement) {
  // Add deleting animation class
  liElement.style.animation = 'slideOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
  
  // Wait for animation to finish
  setTimeout(async () => {
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete task');

      // Update state and re-render
      tasks = tasks.filter(t => t._id !== id);
      renderTasks();
      showToast('Task deleted successfully', 'success');
    } catch (error) {
      console.error('Delete task error:', error);
      showToast('Could not delete task', 'error');
      
      // Revert deletion visual
      liElement.style.animation = '';
      fetchTasks();
    }
  }, 300);
}

// Enter Edit Mode
function enterEditMode(id, liElement) {
  const task = tasks.find(t => t._id === id);
  if (!task) return;

  const contentWrapper = liElement.querySelector('.todo-content-wrapper');
  const actionsWrapper = liElement.querySelector('.todo-actions');
  const oldTextSpan = liElement.querySelector('.todo-text');
  
  // Hide normal text & checkbox, show input
  contentWrapper.style.display = 'none';
  
  const editInput = document.createElement('input');
  editInput.type = 'text';
  editInput.className = 'edit-mode-input';
  editInput.value = task.title;
  liElement.insertBefore(editInput, actionsWrapper);
  editInput.focus();
  editInput.select();

  // Replace action buttons
  actionsWrapper.innerHTML = `
    <button class="action-btn save-btn" aria-label="Save changes">
      <i class="fa-solid fa-check"></i>
    </button>
    <button class="action-btn cancel-btn" aria-label="Cancel editing">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  const saveBtn = actionsWrapper.querySelector('.save-btn');
  const cancelBtn = actionsWrapper.querySelector('.cancel-btn');

  // Save edit handler
  const saveEdit = async () => {
    const newTitle = editInput.value.trim();
    if (!newTitle) {
      showToast('Task title cannot be empty', 'error');
      return;
    }

    if (newTitle === task.title) {
      exitEditMode();
      return;
    }

    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });

      if (!response.ok) throw new Error('Failed to update task title');

      const updatedTask = await response.json();
      task.title = updatedTask.title;
      showToast('Task updated successfully', 'success');
      exitEditMode();
    } catch (error) {
      console.error('Update title error:', error);
      showToast('Could not update task title', 'error');
      exitEditMode();
    }
  };

  // Exit edit mode and restore original UI
  const exitEditMode = () => {
    renderTasks();
  };

  // Event Listeners for edit mode
  saveBtn.addEventListener('click', saveEdit);
  cancelBtn.addEventListener('click', exitEditMode);
  
  editInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') exitEditMode();
  });
}

// Update Statistics Dashboard
function updateStats() {
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const pending = total - completed;

  totalCountEl.textContent = total;
  completedCountEl.textContent = completed;
  pendingCountEl.textContent = pending;
}

// Show/Hide Loading Spinner
function showLoading(isLoading) {
  if (isLoading) {
    loadingState.classList.remove('hidden');
    emptyState.classList.add('hidden');
    todoList.classList.add('hidden');
  } else {
    loadingState.classList.add('hidden');
  }
}

// Toast Notification Helper
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-circle-exclamation';
  if (type === 'info') icon = 'fa-circle-info';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${escapeHTML(message)}</span>
  `;

  toastContainer.appendChild(toast);

  // Auto-dismiss after 3 seconds
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 3000);
}

// HTML Escaping Utility
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
