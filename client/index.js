const chatContainer = document.getElementById("chatContainer");
const userInput = document.getElementById("userInput");
const fileInput = document.getElementById("fileInput");
const sendBtn = document.getElementById("sendBtn");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const imagePreviewThumb = document.getElementById("imagePreviewThumb");
const imagePreviewName = document.getElementById("imagePreviewName");

let currentBase64Image = null;

function getFormattedTime() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Convert uploaded file into a base64 Data URL
function handleImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    currentBase64Image = e.target.result; // data:image/...;base64,...
    imagePreviewThumb.src = currentBase64Image;
    imagePreviewName.textContent = file.name;
    imagePreviewContainer.classList.remove("hidden");
    imagePreviewContainer.classList.add("flex");
    lucide.createIcons();
  };
  reader.readAsDataURL(file);
}

function clearSelectedImage() {
  currentBase64Image = null;
  fileInput.value = "";
  imagePreviewContainer.classList.add("hidden");
  imagePreviewContainer.classList.remove("flex");
}

function appendUserMessage(text, imageUrl) {
  const time = getFormattedTime();
  let imageHtml = '';
  if (imageUrl) {
    imageHtml = `<img src="${imageUrl}" class="mt-2 rounded-xl max-h-48 object-cover border border-white/20" alt="Uploaded asset" />`;
  }

  const msgHtml = `
    <div class="flex flex-col items-end w-full">
      <div class="bg-coral text-white px-6 py-4 rounded-3xl rounded-tr-sm shadow-xs max-w-xl text-[15px] leading-relaxed">
        ${text ? `<p>${text}</p>` : ''}
        ${imageHtml}
      </div>
      <span class="text-xs text-stone-400 font-medium mt-2 mr-1">You • ${time}</span>
    </div>
  `;
  chatContainer.insertAdjacentHTML("beforeend", msgHtml);
  scrollToBottom();
}

function appendAIMessage(text) {
  const time = getFormattedTime();
  const msgHtml = `
    <div class="flex flex-col items-start max-w-2xl">
      <div class="bg-white px-6 py-4 rounded-3xl rounded-tl-sm shadow-xs border border-stone-100 text-[15px] leading-relaxed text-stone-800 whitespace-pre-wrap">
        ${text}
      </div>
      <span class="text-xs text-stone-400 font-medium mt-2 ml-1">Rhea AI • ${time}</span>
    </div>
  `;
  chatContainer.insertAdjacentHTML("beforeend", msgHtml);
  scrollToBottom();
}

function appendLoadingBubble() {
  const id = "loading-" + Date.now();
  const html = `
    <div id="${id}" class="flex flex-col items-start max-w-2xl">
      <div class="bg-white px-6 py-4 rounded-3xl rounded-tl-sm shadow-xs border border-stone-100 flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-stone-300 animate-bounce"></span>
        <span class="w-2 h-2 rounded-full bg-stone-300 animate-bounce [animation-delay:0.2s]"></span>
        <span class="w-2 h-2 rounded-full bg-stone-300 animate-bounce [animation-delay:0.4s]"></span>
      </div>
    </div>
  `;
  chatContainer.insertAdjacentHTML("beforeend", html);
  scrollToBottom();
  return id;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const message = userInput.value.trim();
  const imageUrl = currentBase64Image;

  if (!message && !imageUrl) return;

  // Render message in UI
  appendUserMessage(message, imageUrl);

  // Clear inputs immediately
  userInput.value = "";
  clearSelectedImage();

  userInput.disabled = true;
  sendBtn.disabled = true;

  const loadingId = appendLoadingBubble();

  try {
    const response = await fetch("http://127.0.0.1:8000/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: message || "Analyze this image.",
        image_url: imageUrl || null
      })
    });

    const loadingElem = document.getElementById(loadingId);
    if (loadingElem) loadingElem.remove();

    if (!response.ok) {
      const errData = await response.json();
      appendAIMessage("Error: " + (errData.detail || "Failed to reach server."));
      return;
    }

    const data = await response.json();
    appendAIMessage(data.reply);
  } catch (err) {
    const loadingElem = document.getElementById(loadingId);
    if (loadingElem) loadingElem.remove();
    appendAIMessage("Network error: Could not connect to FastAPI server at http://127.0.0.1:8000. Is Uvicorn running?");
  } finally {
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}