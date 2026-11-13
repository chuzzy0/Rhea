const API_BASE_URL = "http://127.0.0.1:8000";

const chatContainer = document.getElementById("chatContainer");
const userInput = document.getElementById("userInput");
const fileInput = document.getElementById("fileInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const imagePreviewThumb = document.getElementById("imagePreviewThumb");
const imagePreviewName = document.getElementById("imagePreviewName");

let currentBase64Image = null;

// Audio Recording State
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Active Speech Playback State
let currentAudio = null;

function getFormattedTime() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ==========================================
// 1. IMAGE ATTACHMENT LOGIC
// ==========================================
function handleImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    currentBase64Image = e.target.result;
    imagePreviewThumb.src = currentBase64Image;
    imagePreviewName.textContent = file.name;
    imagePreviewContainer.classList.remove("hidden");
    imagePreviewContainer.classList.add("flex");
    if (window.lucide) lucide.createIcons();
  };
  reader.readAsDataURL(file);
}

function clearSelectedImage() {
  currentBase64Image = null;
  fileInput.value = "";
  imagePreviewContainer.classList.add("hidden");
  imagePreviewContainer.classList.remove("flex");
}

// ==========================================
// 2. VOICE TRANSCRIPTION (/transcribe)
// ==========================================
async function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      // Stop microphone tracks to turn off browser recording indicator
      stream.getTracks().forEach(track => track.stop());

      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      await sendAudioForTranscription(audioBlob);
    };

    mediaRecorder.start();
    isRecording = true;

    // Visual recording feedback
    micBtn.classList.remove("text-stone-400", "hover:text-stone-700");
    micBtn.classList.add("text-red-500", "bg-red-50", "animate-pulse");
    userInput.placeholder = "Listening... Click mic to stop";
  } catch (err) {
    alert("Microphone access denied or unavailable.");
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  isRecording = false;
  micBtn.classList.remove("text-red-500", "bg-red-50", "animate-pulse");
  micBtn.classList.add("text-stone-400", "hover:text-stone-700");
  userInput.placeholder = "Transcribing audio...";
}

async function sendAudioForTranscription(audioBlob) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  userInput.disabled = true;
  sendBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/transcribe`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const errData = await response.json();
      alert("Transcription error: " + (errData.detail || "Failed to transcribe."));
      return;
    }

    const data = await response.json();
    if (data.text) {
      // Append or insert transcribed text into input bar
      userInput.value = userInput.value 
        ? `${userInput.value} ${data.text}` 
        : data.text;
    }
  } catch (err) {
    alert("Network error reaching /transcribe endpoint.");
  } finally {
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.placeholder = "Ask a question or describe an inquiry...";
    userInput.focus();
  }
}

// ==========================================
// 3. TEXT-TO-SPEECH (/speak)
// ==========================================
async function speakText(rawText, btnElement) {
  // If audio is currently playing, stop it
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  // Strip basic markdown characters so eSpeak doesn't read "asterisk asterisk"
  const cleanText = rawText.replace(/[*#_`~>-]/g, "").trim();
  if (!cleanText) return;

  btnElement.classList.add("text-coral", "animate-pulse");

  try {
    const response = await fetch(`${API_BASE_URL}/speak`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: cleanText })
    });

    if (!response.ok) {
      const errData = await response.json();
      console.error("Speech error:", errData.detail);
      return;
    }

    const wavBlob = await response.blob();
    const audioUrl = URL.createObjectURL(wavBlob);
    currentAudio = new Audio(audioUrl);

    currentAudio.onended = () => {
      btnElement.classList.remove("text-coral", "animate-pulse");
      URL.revokeObjectURL(audioUrl);
      currentAudio = null;
    };

    await currentAudio.play();
  } catch (err) {
    console.error("Failed to play speech:", err);
  } finally {
    if (!currentAudio) {
      btnElement.classList.remove("text-coral", "animate-pulse");
    }
  }
}

// ==========================================
// 4. CHAT RENDERING & /chat ENDPOINT
// ==========================================
function appendUserMessage(text, imageUrl) {
  const time = getFormattedTime();
  let imageHtml = '';
  if (imageUrl) {
    imageHtml = `<img src="${imageUrl}" class="mt-2 rounded-xl max-h-48 object-cover border border-white/20" alt="Uploaded asset" />`;
  }

  const msgHtml = `
    <div class="flex flex-col items-end w-full">
      <div class="bg-coral text-white px-4 sm:px-6 py-3.5 sm:py-4 rounded-2xl sm:rounded-3xl rounded-tr-xs shadow-xs max-w-full sm:max-w-xl text-sm sm:text-[15px] leading-relaxed">
        ${text ? `<p>${text}</p>` : ''}
        ${imageHtml}
      </div>
      <span class="text-[11px] sm:text-xs text-stone-400 font-medium mt-1.5 mr-1">You • ${time}</span>
    </div>
  `;
  chatContainer.insertAdjacentHTML("beforeend", msgHtml);
  scrollToBottom();
}

function appendAIMessage(text) {
  const time = getFormattedTime();
  const parsedContent = window.marked ? marked.parse(text) : text;

  const wrapper = document.createElement("div");
  wrapper.className = "flex flex-col items-start max-w-full sm:max-w-xl md:max-w-2xl";

  const bubble = document.createElement("div");
  bubble.className = "markdown-body bg-white px-4 sm:px-6 py-3.5 sm:py-4 rounded-2xl sm:rounded-3xl rounded-tl-xs shadow-xs border border-stone-100 text-sm sm:text-[15px] leading-relaxed text-stone-800";
  bubble.innerHTML = parsedContent;

  const metaRow = document.createElement("div");
  metaRow.className = "flex items-center gap-2 mt-1.5 ml-1";

  const timestamp = document.createElement("span");
  timestamp.className = "text-[11px] sm:text-xs text-stone-400 font-medium";
  timestamp.textContent = `Rhea AI • ${time}`;

  const speakBtn = document.createElement("button");
  speakBtn.type = "button";
  speakBtn.className = "text-stone-400 hover:text-coral transition p-1 rounded-full";
  speakBtn.title = "Listen to message";
  speakBtn.innerHTML = `<i data-lucide="volume-2" class="w-3.5 h-3.5"></i>`;
  speakBtn.onclick = () => speakText(text, speakBtn);

  metaRow.appendChild(timestamp);
  metaRow.appendChild(speakBtn);
  wrapper.appendChild(bubble);
  wrapper.appendChild(metaRow);

  chatContainer.appendChild(wrapper);
  if (window.lucide) lucide.createIcons();
  scrollToBottom();
}

function createAIMessageBubble() {
  const time = getFormattedTime();
  const wrapper = document.createElement("div");
  wrapper.className = "flex flex-col items-start max-w-full sm:max-w-xl md:max-w-2xl";

  const bubble = document.createElement("div");
  bubble.className = "markdown-body bg-white px-4 sm:px-6 py-3.5 sm:py-4 rounded-2xl sm:rounded-3xl rounded-tl-xs shadow-xs border border-stone-100 text-sm sm:text-[15px] leading-relaxed text-stone-800";

  const metaRow = document.createElement("div");
  metaRow.className = "flex items-center gap-2 mt-1.5 ml-1";

  const timestamp = document.createElement("span");
  timestamp.className = "text-[11px] sm:text-xs text-stone-400 font-medium";
  timestamp.textContent = `Rhea AI • ${time}`;

  const speakBtn = document.createElement("button");
  speakBtn.type = "button";
  speakBtn.className = "text-stone-400 hover:text-coral transition p-1 rounded-full";
  speakBtn.title = "Listen to message";
  speakBtn.innerHTML = `<i data-lucide="volume-2" class="w-3.5 h-3.5"></i>`;

  metaRow.appendChild(timestamp);
  metaRow.appendChild(speakBtn);
  wrapper.appendChild(bubble);
  wrapper.appendChild(metaRow);

  chatContainer.appendChild(wrapper);
  if (window.lucide) lucide.createIcons();
  scrollToBottom();

  let fullText = "";

  return {
    appendChunk(chunk) {
      fullText += chunk;
      bubble.innerHTML = window.marked ? marked.parse(fullText) : fullText;
      scrollToBottom();
    },
    setError(errText) {
      fullText = errText;
      bubble.textContent = errText;
      bubble.classList.add("text-red-600");
      scrollToBottom();
    },
    finalize() {
      speakBtn.onclick = () => speakText(fullText, speakBtn);
    }
  };
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

  appendUserMessage(message, imageUrl);

  userInput.value = "";
  clearSelectedImage();

  userInput.disabled = true;
  sendBtn.disabled = true;

  const loadingId = appendLoadingBubble();

  try {
    const response = await fetch(`${API_BASE_URL}/chat`, {
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

    const aiMessage = createAIMessageBubble();

    if (!response.ok) {
      const errData = await response.json();
      aiMessage.setError("Error: " + (errData.detail || "Failed to reach server."));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunkText = decoder.decode(value, { stream: true });
      aiMessage.appendChunk(chunkText);
    }

    aiMessage.finalize();

  } catch (err) {
    const loadingElem = document.getElementById(loadingId);
    if (loadingElem) loadingElem.remove();
    const errorBubble = createAIMessageBubble();
    errorBubble.setError("Network error: Could not connect to FastAPI server at http://127.0.0.1:8000. Is Uvicorn running?");
  } finally {
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}