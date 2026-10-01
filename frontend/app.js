const API = "http://127.0.0.1:8000/api";
let currentUser = null;
let currentToken = localStorage.getItem("campus_jwt");
let activeEvents = [];
let activeSelectedEvent = null;
let activeEventFilter = { type: "all", host: "" };
let registeredStudents = [];
let gateManifest = [];
let eventPaymentQrData = null;
let eventExistingPaymentQr = "";
let eventPaymentQrRemoved = false;

async function initApp() {
  if (currentToken) {
    try {
      const res = await fetch(`${API}/auth/me`, {
        headers: { "Authorization": `Bearer ${currentToken}` }
      });
      if (res.ok) {
        currentUser = await res.json();
      } else {
        logout();
      }
    } catch (e) {
      console.warn("Backend not yet connected.");
    }
  }
  updateAuthUI();
  fetchEvents();
  initWebSocket();
  setupParallax();
}

function initWebSocket() {
  const ws = new WebSocket("ws://127.0.0.1:8000/ws");
  ws.onmessage = () => {
    fetchEvents();
    if (currentUser?.role === "admin") loadAdminData();
    if (currentUser?.role === "student") loadMyBookings();
    if (activeSelectedEvent) loadEventDetail(activeSelectedEvent.id);
  };
  ws.onclose = () => setTimeout(initWebSocket, 2500);
}

function navigateTo(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-links .nav-btn").forEach(b => b.classList.remove("active"));

  const target = document.getElementById(`view-${viewId}`);
  if (target) target.classList.add("active");

  const navBtn = document.getElementById(`nav-${viewId}`);
  if (navBtn) navBtn.classList.add("active");

  if (viewId === "events") fetchEvents();
  if (viewId === "bookings") loadMyBookings();
  if (viewId === "admin") loadAdminData();
  if (viewId === "profile") loadStudentProfile();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function navLinkClick(viewId) {
  closeMobileNav();
  navigateTo(viewId);
}

function toggleMobileNav() {
  document.getElementById("nav-toggle")?.classList.toggle("open");
  document.getElementById("nav-links")?.classList.toggle("active");
}

function closeMobileNav() {
  document.getElementById("nav-toggle")?.classList.remove("open");
  document.getElementById("nav-links")?.classList.remove("active");
}

function updateAuthUI() {
  const badge = document.getElementById("user-badge");
  const authBtn = document.getElementById("nav-auth");
  const bookingsBtn = document.getElementById("nav-bookings");
  const adminBtn = document.getElementById("nav-admin");
  const profileBtn = document.getElementById("nav-profile");
  const homeHeroAuthBtn = document.getElementById("home-hero-auth-btn");

  if (currentUser) {
    badge.textContent = currentUser.role === "admin" ? "FACULTY" : "STUDENT";
    badge.className = `role-pill role-${currentUser.role === 'admin' ? 'admin' : 'user'}`;
    authBtn.textContent = `Sign Out (${currentUser.name.split(" ")[0]})`;
    authBtn.onclick = logout;

    bookingsBtn.style.display = currentUser.role === "student" ? "inline-block" : "none";
    profileBtn.style.display = currentUser.role === "student" ? "inline-block" : "none";
    adminBtn.style.display = currentUser.role === "admin" ? "inline-block" : "none";

    if (homeHeroAuthBtn) {
      if (currentUser.role === "admin") {
        homeHeroAuthBtn.textContent = "Faculty Operations Portal →";
        homeHeroAuthBtn.onclick = () => navigateTo("admin");
      } else {
        homeHeroAuthBtn.textContent = "View My Passes →";
        homeHeroAuthBtn.onclick = () => navigateTo("bookings");
      }
    }
  } else {
    badge.textContent = "VISITOR";
    badge.className = "role-pill role-visitor";
    authBtn.textContent = "Login";
    authBtn.onclick = () => navigateTo("auth");
    bookingsBtn.style.display = "none";
    profileBtn.style.display = "none";
    adminBtn.style.display = "none";

    if (homeHeroAuthBtn) {
      homeHeroAuthBtn.textContent = "Student Login / Sign Up";
      homeHeroAuthBtn.onclick = () => navigateTo("auth");
    }
  }
}

function logout() {
  localStorage.removeItem("campus_jwt");
  currentToken = null;
  currentUser = null;
  updateAuthUI();
  navigateTo("home");
}

function switchAuthTab(tab) {
  document.getElementById("tab-login").classList.toggle("active", tab === "login");
  document.getElementById("tab-signup").classList.toggle("active", tab === "signup");
  document.getElementById("form-login").style.display = tab === "login" ? "block" : "none";
  document.getElementById("form-signup").style.display = tab === "signup" ? "block" : "none";
}

async function handleLogin(e) {
  e.preventDefault();
  const payload = {
    email: document.getElementById("login-email").value,
    password: document.getElementById("login-password").value
  };

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Login failed");

    currentToken = data.access_token;
    currentUser = data.user;
    localStorage.setItem("campus_jwt", currentToken);
    updateAuthUI();

    if (currentUser.role === "admin") navigateTo("admin");
    else navigateTo("events");
  } catch (err) {
    alert(err.message);
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById("signup-name").value,
    email: document.getElementById("signup-email").value,
    roll_number: document.getElementById("signup-roll").value,
    department: document.getElementById("signup-dept").value,
    academic_year: document.getElementById("signup-year").value,
    password: document.getElementById("signup-password").value
  };

  try {
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Registration failed");

    currentToken = data.access_token;
    currentUser = data.user;
    localStorage.setItem("campus_jwt", currentToken);
    updateAuthUI();

    if (currentUser.role === "admin") navigateTo("admin");
    else navigateTo("events");
  } catch (err) {
    alert(err.message);
  }
}

function loadStudentProfile() {
  if (!currentUser || currentUser.role !== "student") return;
  document.getElementById("profile-name").value = currentUser.name || "";
  document.getElementById("profile-email").value = currentUser.email || "";
  document.getElementById("profile-roll").value = currentUser.roll_number || "";
  document.getElementById("profile-department").value = currentUser.department || "";
  document.getElementById("profile-year").value = currentUser.academic_year || "";
  document.getElementById("profile-message").textContent = "";
}

async function saveStudentProfile(e) {
  e.preventDefault();
  const message = document.getElementById("profile-message");
  const payload = {
    name: document.getElementById("profile-name").value.trim(),
    email: document.getElementById("profile-email").value.trim(),
    roll_number: document.getElementById("profile-roll").value.trim(),
    department: document.getElementById("profile-department").value.trim(),
    academic_year: document.getElementById("profile-year").value.trim()
  };

  try {
    const res = await fetch(`${API}/auth/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentToken}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Unable to save profile");
    currentUser = data;
    updateAuthUI();
    message.textContent = "Profile saved.";
    message.classList.add("success");
    loadMyBookings();
  } catch (err) {
    message.textContent = err.message;
    message.classList.remove("success");
  }
}

function printCertificate() {
  document.body.classList.add("printing-certificate");
  window.print();
  document.body.classList.remove("printing-certificate");
}

async function fetchEvents() {
  try {
    const res = await fetch(`${API}/events`);
    activeEvents = await res.json();
    renderEvents(getFilteredEvents());
    updateHomeTelemetry();
  } catch (e) {
    console.error("Failed to load events", e);
  }
}

function getFilteredEvents() {
  if (activeEventFilter.type === "free") return activeEvents.filter(event => event.price === 0);
  if (activeEventFilter.type === "team") return activeEvents.filter(event => event.is_team_event === 1);
  if (activeEventFilter.type === "host") return activeEvents.filter(event => event.category === activeEventFilter.host);
  return activeEvents;
}

async function renderEvents(list) {
  const grid = document.getElementById("events-grid");
  if (!grid) return;
  const filterLabel = document.getElementById("events-filter-label");
  if (filterLabel) {
    if (activeEventFilter.type === "host") filterLabel.textContent = `Hosted by ${activeEventFilter.host}`;
    else if (activeEventFilter.type === "free") filterLabel.textContent = "Free events";
    else if (activeEventFilter.type === "team") filterLabel.textContent = "Team events";
    else filterLabel.textContent = "";
  }

  if (list.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-muted); grid-column: 1/-1;">No campus events found under this filter.</p>`;
    return;
  }

  let bookedEventIds = new Set();
  if (currentUser && currentUser.role === "student" && currentToken) {
    try {
      const myRes = await fetch(`${API}/bookings/my`, {
        headers: { "Authorization": `Bearer ${currentToken}` }
      });
      if (myRes.ok) {
        const myBookings = await myRes.json();
        myBookings.forEach(b => {
          if (b.status !== "Cancelled") bookedEventIds.add(b.event_id);
        });
      }
    } catch (e) {
      console.warn("Error fetching registered event IDs", e);
    }
  }

  grid.innerHTML = list.map(ev => {
    const isBooked = bookedEventIds.has(ev.id);
    const pct = Math.min(100, Math.round((ev.registered_count / ev.capacity) * 100));
    return `
      <div class="card ${isBooked ? 'card-registered' : ''}" onclick="loadEventDetail(${ev.id})">
        <div>
          <div style="display:flex; justify-content:space-between; margin-bottom: 0.8rem; align-items:center;">
            <span class="badge badge-${ev.status.replace(' ', '-')}">${ev.status}</span>
            <div style="display:flex; gap:0.4rem; align-items:center;">
              ${isBooked ? '<span class="entry-tag entry-registered">✓ Registered</span>' : ''}
              <span class="entry-tag ${ev.price > 0 ? 'entry-paid' : 'entry-free'}">
                ${ev.price > 0 ? `Entry: ₹${ev.price}` : 'FREE ENTRY'}
              </span>
            </div>
          </div>
          <h3 style="font-size: 1.25rem; font-weight:800; margin-bottom: 0.35rem;">${ev.title}</h3>
          <p style="color:var(--text-muted); font-size: 0.85rem; margin-bottom: 0.8rem;">📍 ${ev.venue} • 🗓️ ${ev.date_str}</p>
          <div style="display:flex; gap:0.4rem; margin-bottom:1.25rem;">
            <span class="role-pill role-visitor">${ev.category}</span>
            ${ev.is_team_event ? `<span class="role-pill role-user">Team (${ev.team_size})</span>` : '<span class="role-pill role-visitor">Solo</span>'}
          </div>
        </div>
        <div>
          <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-muted);">
            <span>Capacity Quota</span>
            <span>${ev.registered_count} / ${ev.capacity} (${pct}%)</span>
          </div>
          <div class="bar-wrap"><div class="bar-fill" style="width: ${pct}%;"></div></div>
        </div>
      </div>
    `;
  }).join('');
}

function filterEventCategory(type) {
  activeEventFilter = { type, host: "" };
  renderEvents(getFilteredEvents());
}

function browseHostCategory(category) {
  activeEventFilter = { type: "host", host: category };
  navigateTo("events");
}


async function loadEventDetail(id) {
  try {
    const res = await fetch(`${API}/events/${id}`);
    activeSelectedEvent = await res.json();

    document.getElementById("det-title").textContent = activeSelectedEvent.title;
    document.getElementById("det-meta").textContent = `📍 ${activeSelectedEvent.venue} • 🗓️ ${activeSelectedEvent.date_str} • Host: ${activeSelectedEvent.category}`;
    document.getElementById("det-desc").textContent = activeSelectedEvent.description || "No extended briefing provided.";

    const priceEl = document.getElementById("det-price");
    if (activeSelectedEvent.price > 0) {
      priceEl.textContent = `₹${activeSelectedEvent.price} Entry Fee`;
      priceEl.style.color = "var(--amber)";
    } else {
      priceEl.textContent = "FREE REGISTRATION";
      priceEl.style.color = "var(--emerald)";
    }

    const badge = document.getElementById("det-badge");
    badge.textContent = activeSelectedEvent.status;
    badge.className = `badge badge-${activeSelectedEvent.status.replace(' ', '-')}`;

    document.getElementById("det-team-badge").innerHTML = activeSelectedEvent.is_team_event ?
      `<span class="role-pill role-user" style="font-size:0.8rem;">TEAM PARTICIPATION: UP TO ${activeSelectedEvent.team_size} MEMBERS</span>` :
      `<span class="role-pill role-visitor" style="font-size:0.8rem;">INDIVIDUAL STUDENT ENTRY</span>`;

    const pct = Math.min(100, Math.round((activeSelectedEvent.registered_count / activeSelectedEvent.capacity) * 100));
    document.getElementById("det-seats").textContent = `${activeSelectedEvent.registered_count} / ${activeSelectedEvent.capacity} Reserved`;
    document.getElementById("det-bar").style.width = `${pct}%`;

    const bookBtn = document.getElementById("det-book-btn");

    let hasAlreadyRegistered = false;
    if (currentUser && currentUser.role === "student" && currentToken) {
      try {
        const myRes = await fetch(`${API}/bookings/my`, {
          headers: { "Authorization": `Bearer ${currentToken}` }
        });
        if (myRes.ok) {
          const myBookings = await myRes.json();
          hasAlreadyRegistered = myBookings.some(b => b.event_id === activeSelectedEvent.id && b.status !== "Cancelled");
        }
      } catch (err) {
        console.warn("Could not verify student booking status", err);
      }
    }

    if (hasAlreadyRegistered) {
      bookBtn.disabled = true;
      bookBtn.textContent = "✓ Already Registered";
      bookBtn.className = "btn btn-registered";
    } else if (activeSelectedEvent.status === "Sold Out" || activeSelectedEvent.registered_count >= activeSelectedEvent.capacity) {
      bookBtn.disabled = true;
      bookBtn.textContent = "Seats Filled (Sold Out)";
      bookBtn.className = "btn btn-secondary";
    } else if (currentUser && currentUser.role === "admin") {
      bookBtn.disabled = true;
      bookBtn.textContent = "Faculty / Admin View Only";
      bookBtn.className = "btn btn-secondary";
    } else {
      bookBtn.disabled = false;
      bookBtn.textContent = "Proceed to Register →";
      bookBtn.className = "btn btn-primary";
    }

    navigateTo("details");
  } catch (e) {
    alert("Could not load event details.");
  }
}

function proceedToRegister() {
  if (!currentUser) {
    alert("Please sign in with your student account to register.");
    navigateTo("auth");
    return;
  }
  if (currentUser.role === "admin") {
    alert("Faculty and Admins cannot book student entry passes.");
    return;
  }

  document.getElementById("reg-event-title").textContent = `Event: ${activeSelectedEvent.title}`;
  document.getElementById("reg-name").value = currentUser.name;
  document.getElementById("reg-roll").value = currentUser.roll_number;
  document.getElementById("reg-dept").value = currentUser.department;

  const teamSection = document.getElementById("reg-team-section");
  if (activeSelectedEvent.is_team_event) {
    teamSection.style.display = "block";
    document.getElementById("reg-team-name").required = true;
    document.getElementById("reg-team-members").required = true;
  } else {
    teamSection.style.display = "none";
    document.getElementById("reg-team-name").required = false;
    document.getElementById("reg-team-members").required = false;
  }

  const paymentSection = document.getElementById("reg-payment-section");
  const submitBtn = document.getElementById("reg-submit-btn");
  const upiInput = document.getElementById("reg-upi-utr");

  if (activeSelectedEvent.price > 0) {
    const totalFee = activeSelectedEvent.price * (activeSelectedEvent.is_team_event ? activeSelectedEvent.team_size : 1);
    paymentSection.style.display = "block";
    document.getElementById("reg-fee-display").textContent = `₹${totalFee}`;
    renderCheckoutPaymentQr(activeSelectedEvent.payment_qr);
    upiInput.required = true;
    upiInput.value = "";
    submitBtn.textContent = `Pay ₹${totalFee} & Confirm Pass`;
  } else {
    paymentSection.style.display = "none";
    upiInput.required = false;
    upiInput.value = "";
    submitBtn.textContent = "Confirm Free Pass Reservation";
  }

  navigateTo("register");
}

function renderCheckoutPaymentQr(qrPath) {
  const container = document.getElementById("reg-payment-qr");
  if (!qrPath) {
    container.innerHTML = '<p class="payment-qr-empty">The event organizer has not added a payment QR code yet.</p>';
    return;
  }
  const imageUrl = qrPath.startsWith("http") ? qrPath : `${API.replace(/\/api$/, "")}${qrPath}`;
  container.innerHTML = `<img class="payment-qr-image" src="${imageUrl}" alt="Payment QR code for ${activeSelectedEvent.title}">`;
}

async function handlePassBooking(e) {
  e.preventDefault();
  const isTeam = activeSelectedEvent.is_team_event === 1;
  const isPaid = activeSelectedEvent.price > 0;
  const utr = document.getElementById("reg-upi-utr")?.value.trim();

  if (isPaid && (!utr || utr.length < 8)) {
    alert("Please enter a valid 12-digit UPI Transaction / UTR ID after paying.");
    return;
  }

  const payload = {
    event_id: activeSelectedEvent.id,
    ticket_count: isTeam ? activeSelectedEvent.team_size : 1,
    team_name: isTeam ? document.getElementById("reg-team-name").value : "Solo Participant",
    team_members: isTeam ? document.getElementById("reg-team-members").value : `${currentUser.name} (${currentUser.roll_number})`,
    transaction_id: isPaid ? utr : "FREE_PASS"
  };

  try {
    const res = await fetch(`${API}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentToken}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Booking failed");

    alert(`Registration confirmed! ${isPaid ? `Payment of ₹${data.amount_paid} recorded (UTR:${data.transaction_id})` : 'Free entry pass issued.'}`);
    navigateTo("bookings");
  } catch (err) {
    alert(err.message);
  }
}
let html5QrCodeScanner = null;

function openScannerModal() {
  document.getElementById("scanner-modal").classList.add("active");
  const resultEl = document.getElementById("scanner-result");
  resultEl.style.display = "none";

  html5QrCodeScanner = new Html5Qrcode("reader");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrCodeScanner.start(
    { facingMode: "environment" },
    config,
    onQrScanSuccess,
    (errorMessage) => {}
  ).catch(err => {
    alert("Camera permission denied or camera not found on this device.");
    closeScannerModal();
  });
}

async function onQrScanSuccess(decodedText) {
  try {
    const payload = JSON.parse(decodedText);
    if (!payload.booking_id) throw new Error("Invalid pass format");

    if (html5QrCodeScanner) await html5QrCodeScanner.pause();

    const res = await fetch(`${API}/admin/check-in/${payload.booking_id}`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${currentToken}` }
    });
    const data = await res.json();

    const resultEl = document.getElementById("scanner-result");
    resultEl.style.display = "block";
    resultEl.innerHTML = `✅ <b>Gate Check-In Confirmed!</b><br>Student: ${payload.name} (${payload.roll_number})<br>Pass ID: #${payload.booking_id}`;

    loadAdminData();
    setTimeout(async () => {
      resultEl.style.display = "none";
      if (html5QrCodeScanner) html5QrCodeScanner.resume();
    }, 2500);

  } catch (err) {
    alert("Scanned QR is not a valid campus event pass.");
    if (html5QrCodeScanner) html5QrCodeScanner.resume();
  }
}

function closeScannerModal() {
  if (html5QrCodeScanner) {
    html5QrCodeScanner.stop().then(() => {
      html5QrCodeScanner.clear();
      document.getElementById("scanner-modal").classList.remove("active");
    }).catch(() => {
      document.getElementById("scanner-modal").classList.remove("active");
    });
  } else {
    document.getElementById("scanner-modal").classList.remove("active");
  }
}

async function loadMyBookings() {
  if (!currentUser || currentUser.role !== "student") return;
  const container = document.getElementById("bookings-list");
  try {
    const res = await fetch(`${API}/bookings/my`, {
      headers: { "Authorization": `Bearer ${currentToken}` }
    });
    const bookings = await res.json();
    if (!res.ok) throw new Error(bookings.detail || "Unable to load your passes.");
    if (!Array.isArray(bookings)) throw new Error("The server returned an invalid bookings response.");

    if (bookings.length === 0) {
      container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding: 2rem;">No active passes registered. Explore events and reserve your seat!</p>`;
      return;
    }

    container.innerHTML = bookings.map(b => `
      <div class="ticket-card" id="ticket-${b.id}">
        <div style="flex: 1;">
          <div style="display:flex; gap:0.5rem; margin-bottom:0.5rem; align-items:center;">
            <span class="badge" style="background:rgba(255,255,255,0.08);">PASS #${b.id}</span>
            <span class="badge" style="background:${b.status === 'Checked In' ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.2)'}; color:${b.status === 'Checked In' ? '#34d399' : '#818cf8'};">
              ${b.status}
            </span>
          </div>
          <h3 style="font-size: 1.3rem; font-weight:800; margin-bottom: 0.3rem;">${b.event_title}</h3>
          <p style="color:var(--text-muted); font-size: 0.85rem; margin-bottom: 0.5rem;">📍 ${b.event_venue} • 🗓️ ${b.event_date}</p>
          <div style="font-size:0.85rem; color:#cbd5e1; margin-bottom:0.75rem;">
  Roll: <b>${b.user_roll}</b> • Team: <b>${b.team_name}</b> (${b.ticket_count} Seats)<br>
  Payment: <b style="color:${b.amount_paid > 0 ? 'var(--amber)' : 'var(--emerald)'};">${b.amount_paid > 0 ? `₹${b.amount_paid} Paid (UTR: ${b.transaction_id})` : 'Free Admission'}</b>
</div>
          ${b.certificate_issued ? `
            <button class="btn btn-secondary" style="font-size:0.78rem; color:#fbbf24; border-color: rgba(251,191,36,0.3);" onclick="viewCertificate('${b.user_name}', '${b.user_roll}', '${b.event_title}')">
              🏆 View Certificate of Participation
            </button>
          ` : '<span style="font-size:0.75rem; color:var(--text-muted);">*Certificate unlocks after gate check-in</span>'}
        </div>

        <div style="text-align: right; display:flex; flex-direction:column; align-items:center; gap:0.6rem;">
          <div class="qr-canvas-box" id="qrcode-box-${b.id}"></div>
          <button class="btn btn-danger" style="padding:0.35rem 0.75rem; font-size:0.75rem;" onclick="cancelBooking(${b.id})">Cancel Pass</button>
        </div>
      </div>
    `).join('');

    bookings.forEach(b => {
      const box = document.getElementById(`qrcode-box-${b.id}`);
      if (box) {
        box.innerHTML = "";
        const qrPayload = JSON.stringify({
          booking_id: b.id,
          event_id: b.event_id,
          roll_number: b.user_roll,
          name: b.user_name
        });

        new QRCode(box, {
          text: qrPayload,
          width: 95,
          height: 95,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      }
    });

  } catch (e) {
    console.error("Failed to load bookings", e);
    if (container) {
      container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding: 2rem;">Unable to load your passes right now. Please try again.</p>`;
    }
  }
}
async function cancelBooking(id) {
  if (!confirm("Release your seat for this campus event?")) return;
  try {
    const res = await fetch(`${API}/bookings/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${currentToken}` }
    });
    if (!res.ok) throw new Error("Cancellation failed");
    loadMyBookings();
  } catch (err) {
    alert(err.message);
  }
}

function viewCertificate(name, roll, eventTitle) {
  document.getElementById("cert-student-name").textContent = name;
  document.getElementById("cert-roll").textContent = `Roll No: ${roll}`;
  document.getElementById("cert-event-title").textContent = eventTitle;
  document.getElementById("cert-modal").classList.add("active");
}

async function loadAdminData() {
  if (!currentUser || currentUser.role !== "admin") return;
  try {
    const [eventsRes, manifestRes, usersRes, staffRes] = await Promise.all([
      fetch(`${API}/events`),
      fetch(`${API}/admin/manifest`, { headers: { "Authorization": `Bearer ${currentToken}` } }),
      fetch(`${API}/admin/users`, { headers: { "Authorization": `Bearer ${currentToken}` } }),
      fetch(`${API}/admin/staff`, { headers: { "Authorization": `Bearer ${currentToken}` } })
    ]);
    const evList = await eventsRes.json();
    activeEvents = evList;
    gateManifest = await manifestRes.json();
    registeredStudents = await usersRes.json();
    const staffAccounts = await staffRes.json();
    if (!eventsRes.ok || !manifestRes.ok || !usersRes.ok || !staffRes.ok) {
      throw new Error("Unable to load admin records");
    }

    document.getElementById("admin-events-table").innerHTML = evList.map(e => `
      <tr>
        <td>#EV-${e.id}</td>
        <td><b>${e.title}</b><div style="font-size:0.75rem; color:var(--text-muted);">${e.category}</div></td>
        <td>${e.venue}<div style="font-size:0.75rem; color:var(--text-muted);">${e.date_str}</div></td>
        <td>${e.is_team_event ? `Team (${e.team_size})` : 'Solo'}</td>
        <td><b>${e.price > 0 ? '₹' + e.price : 'Free'}</b></td>
        <td>${e.registered_count} / ${e.capacity}</td>
        <td style="text-align: right;">
          <button class="btn btn-secondary" style="padding:0.35rem 0.75rem; font-size:0.8rem;" onclick="openEditModal(${e.id})">Edit</button>
          <button class="btn btn-danger" style="padding:0.35rem 0.75rem; font-size:0.8rem;" onclick="deleteEvent(${e.id})">Delete</button>
        </td>
      </tr>
    `).join('');

    document.getElementById("admin-users-table").innerHTML = registeredStudents.map(u => `
      <tr>
        <td>#STU-${u.id}</td>
        <td><b>${u.name}</b></td>
        <td>${u.roll_number}</td>
        <td>${u.department}</td>
        <td>${u.academic_year}</td>
        <td><b>${u.total_bookings} pass(es)</b></td>
        <td style="text-align: right;">
          <button class="btn btn-secondary" style="padding:0.35rem 0.75rem; font-size:0.8rem;" onclick="viewStudentListings(${u.id})">
            Inspect (${u.total_bookings})
          </button>
        </td>
      </tr>
    `).join('');

    document.getElementById("admin-manifest-table").innerHTML = gateManifest.map(b => `
      <tr>
        <td>#PASS-${b.id}</td>
        <td><b>${b.user_name}</b><div style="font-size:0.75rem; color:var(--text-muted);">${b.user_roll} • ${b.user_dept}</div></td>
        <td>${b.event_title}</td>
        <td>${b.team_name}</td>
        <td>
          <span class="badge" style="background:${b.status === 'Checked In' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}; color:${b.status === 'Checked In' ? '#34d399' : '#fff'};">
            ${b.status}
          </span>
        </td>
        <td style="text-align: right;">
          <button class="btn btn-secondary" style="padding:0.35rem 0.75rem; font-size:0.8rem;" onclick="toggleCheckIn(${b.id})">
            ${b.status === "Checked In" ? "Undo Check-In" : "Gate Check-In"}
          </button>
        </td>
      </tr>
    `).join('');

    document.getElementById("admin-staff-table").innerHTML = staffAccounts.map(staff => `
      <tr>
        <td>${staff.roll_number}</td>
        <td><b>${staff.name}</b></td>
        <td>${staff.job_title || "Faculty / Staff"}</td>
        <td>${staff.email}</td>
        <td>${staff.department}</td>
      </tr>
    `).join('');
  } catch (e) {
    console.error("Admin data load error", e);
  }
}

function switchAdminTab(tab) {
  document.getElementById("tab-adm-events").classList.toggle("active", tab === "events");
  document.getElementById("tab-adm-users").classList.toggle("active", tab === "users");
  document.getElementById("tab-adm-manifest").classList.toggle("active", tab === "manifest");
  document.getElementById("tab-adm-staff").classList.toggle("active", tab === "staff");

  document.getElementById("adm-sec-events").style.display = tab === "events" ? "block" : "none";
  document.getElementById("adm-sec-users").style.display = tab === "users" ? "block" : "none";
  document.getElementById("adm-sec-manifest").style.display = tab === "manifest" ? "block" : "none";
  document.getElementById("adm-sec-staff").style.display = tab === "staff" ? "grid" : "none";
}

async function createStaffAccount(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById("staff-name").value.trim(),
    email: document.getElementById("staff-email").value.trim(),
    roll_number: document.getElementById("staff-id").value.trim(),
    department: document.getElementById("staff-department").value.trim(),
    job_title: document.getElementById("staff-title").value.trim(),
    password: document.getElementById("staff-password").value
  };

  try {
    const res = await fetch(`${API}/admin/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentToken}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Unable to create staff account");
    e.target.reset();
    await loadAdminData();
    switchAdminTab("staff");
    alert(`Staff account created for ${data.name}.`);
  } catch (err) {
    alert(err.message);
  }
}

function viewStudentListings(id) {
  const u = registeredStudents.find(x => x.id === id);
  if (!u) return;

  document.getElementById("udm-name").textContent = `${u.name} (${u.roll_number})`;
  document.getElementById("udm-email").textContent = `${u.department} • ${u.academic_year}`;

  const container = document.getElementById("udm-bookings-container");
  if (u.bookings.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding: 1.5rem;">No passes reserved yet.</p>`;
  } else {
    container.innerHTML = u.bookings.map(b => `
      <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); border-radius:12px; padding:1.2rem; margin-bottom:0.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
          <h4 style="font-size:1.05rem; font-weight:700;">${b.event_title}</h4>
          <span class="badge" style="background:${b.status === 'Checked In' ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.2)'}; color:${b.status === 'Checked In' ? '#34d399' : '#818cf8'};">${b.status}</span>
        </div>
        <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem;">📍 ${b.event_venue} • 🗓️ ${b.event_date}</p>
        <div style="font-size:0.85rem; color:#cbd5e1;">Team: <b>${b.team_name}</b> • Passes: <b>${b.ticket_count}</b></div>
      </div>
    `).join('');
  }
  document.getElementById("user-details-modal").classList.add("active");
}

function closeUserDetailsModal() {
  document.getElementById("user-details-modal").classList.remove("active");
}

function exportODList() {
  if (gateManifest.length === 0) {
    alert("No registrations available to export.");
    return;
  }
  let csv = "Pass_ID,Student_Name,Roll_Number,Department,Event_Name,Team_Name,Check_In_Status\n";
  gateManifest.forEach(b => {
    csv += `${b.id},"${b.user_name}","${b.user_roll}","${b.user_dept}","${b.event_title}","${b.team_name}","${b.status}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.setAttribute("href", url);
  a.setAttribute("download", `Campus_OD_Attendance_${new Date().toISOString().slice(0,10)}.csv`);
  a.click();
}

function openEventModal() {
  document.getElementById("modal-heading").textContent = "Deploy Campus Event";
  document.getElementById("modal-ev-id").value = "";
  document.getElementById("modal-ev-title").value = "";
  document.getElementById("modal-ev-category").value = "CSE Department";
  document.getElementById("modal-ev-price").value = "0";
  document.getElementById("modal-payment-qr").value = "";
  document.getElementById("modal-ev-venue").value = "";
  document.getElementById("modal-ev-date").value = "";
  document.getElementById("modal-ev-capacity").value = "100";
  document.getElementById("modal-ev-team-select").value = "0";
  document.getElementById("modal-ev-team-size").value = "4";
  toggleTeamSizeInput("0");
  document.getElementById("modal-ev-status").value = "Published";
  document.getElementById("modal-ev-desc").value = "";
  eventPaymentQrData = null;
  eventExistingPaymentQr = "";
  eventPaymentQrRemoved = false;
  renderPaymentQrPreview();
  togglePaymentQrField();
  document.getElementById("event-modal").classList.add("active");
}

function openEditModal(id) {
  const ev = activeEvents.find(e => e.id === id);
  if (!ev) return;
  document.getElementById("modal-heading").textContent = `Edit Event #${ev.id}`;
  document.getElementById("modal-ev-id").value = ev.id;
  document.getElementById("modal-ev-title").value = ev.title;
  document.getElementById("modal-ev-category").value = ev.category;
  document.getElementById("modal-ev-price").value = ev.price;
  document.getElementById("modal-payment-qr").value = "";
  document.getElementById("modal-ev-venue").value = ev.venue;
  document.getElementById("modal-ev-date").value = ev.date_str;
  document.getElementById("modal-ev-capacity").value = ev.capacity;
  document.getElementById("modal-ev-team-select").value = ev.is_team_event.toString();
  document.getElementById("modal-ev-team-size").value = ev.is_team_event ? (ev.team_size || 4) : 4;
  toggleTeamSizeInput(ev.is_team_event.toString());
  document.getElementById("modal-ev-status").value = ev.status;
  document.getElementById("modal-ev-desc").value = ev.description || "";
  eventPaymentQrData = null;
  eventExistingPaymentQr = ev.payment_qr || "";
  eventPaymentQrRemoved = false;
  renderPaymentQrPreview();
  togglePaymentQrField();
  document.getElementById("event-modal").classList.add("active");
}

function togglePaymentQrField() {
  const isPaidEvent = Number(document.getElementById("modal-ev-price").value) > 0;
  document.getElementById("modal-payment-qr-wrap").style.display = isPaidEvent ? "block" : "none";
}

function handlePaymentQrFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1_000_000) {
    alert("Choose a PNG, JPG, or WEBP image smaller than 1 MB.");
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    eventPaymentQrData = reader.result;
    eventPaymentQrRemoved = false;
    renderPaymentQrPreview();
  };
  reader.onerror = () => alert("Could not read the selected QR image.");
  reader.readAsDataURL(file);
}

function renderPaymentQrPreview() {
  const preview = document.getElementById("modal-payment-qr-preview");
  preview.replaceChildren();
  const qrPath = eventPaymentQrData || eventExistingPaymentQr;
  if (!qrPath) {
    preview.textContent = eventPaymentQrRemoved ? "Payment QR removed." : "No payment QR uploaded.";
    return;
  }

  const image = document.createElement("img");
  image.className = "payment-qr-preview-image";
  image.alt = "Payment QR preview";
  image.src = qrPath.startsWith("data:") ? qrPath : `${API.replace(/\/api$/, "")}${qrPath}`;
  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "btn btn-danger";
  clearButton.textContent = "Remove QR";
  clearButton.onclick = clearPaymentQr;
  preview.append(image, clearButton);
}

function clearPaymentQr() {
  eventPaymentQrData = null;
  eventExistingPaymentQr = "";
  eventPaymentQrRemoved = true;
  document.getElementById("modal-payment-qr").value = "";
  renderPaymentQrPreview();
}

function closeEventModal() {
  document.getElementById("event-modal").classList.remove("active");
}

function toggleTeamSizeInput(val) {
  const isTeamEvent = val === "1";
  document.getElementById("modal-team-size-wrap").style.display = isTeamEvent ? "block" : "none";
  document.getElementById("modal-ev-team-size").disabled = !isTeamEvent;
}

async function handleSaveEvent(e) {
  e.preventDefault();
  const id = document.getElementById("modal-ev-id").value;
  const isTeam = parseInt(document.getElementById("modal-ev-team-select").value, 10);
  const payload = {
    title: document.getElementById("modal-ev-title").value,
    category: document.getElementById("modal-ev-category").value,
    price: parseFloat(document.getElementById("modal-ev-price").value) || 0,
    venue: document.getElementById("modal-ev-venue").value,
    date_str: document.getElementById("modal-ev-date").value,
    capacity: parseInt(document.getElementById("modal-ev-capacity").value, 10),
    is_team_event: isTeam,
    team_size: isTeam ? parseInt(document.getElementById("modal-ev-team-size").value, 10) : 1,
    status: document.getElementById("modal-ev-status").value,
    description: document.getElementById("modal-ev-desc").value
  };
  if (payload.price <= 0 || eventPaymentQrRemoved) {
    payload.payment_qr = "";
  } else if (eventPaymentQrData) {
    payload.payment_qr = eventPaymentQrData;
  }

  try {
    const url = id ? `${API}/events/${id}` : `${API}/events`;
    const res = await fetch(url, {
      method: id ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentToken}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to save event");
    closeEventModal();
    loadAdminData();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteEvent(id) {
  if (!confirm("Decommission this campus event? All student passes will be cancelled.")) return;
  try {
    await fetch(`${API}/events/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${currentToken}` }
    });
    loadAdminData();
  } catch (e) {
    alert("Delete failed.");
  }
}

async function toggleCheckIn(id) {
  try {
    await fetch(`${API}/admin/check-in/${id}`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${currentToken}` }
    });
    loadAdminData();
  } catch (e) {
    alert("Check-in update failed");
  }
}

function updateHomeTelemetry() {
  const totalEvents = activeEvents.length;
  const totalSeats = activeEvents.reduce((acc, ev) => acc + (ev.registered_count || 0), 0);
  const totalCap = activeEvents.reduce((acc, ev) => acc + (ev.capacity || 0), 0);
  const avgFill = totalCap > 0 ? Math.round((totalSeats / totalCap) * 100) : 0;

  if (document.getElementById("home-stat-events")) document.getElementById("home-stat-events").textContent = totalEvents;
  if (document.getElementById("home-stat-seats")) document.getElementById("home-stat-seats").textContent = totalSeats;
  if (document.getElementById("home-stat-fill")) document.getElementById("home-stat-fill").textContent = `${avgFill}%`;

  const featGrid = document.getElementById("home-featured-grid");
  if (featGrid) {
    const featured = activeEvents.slice(0, 2);
    featGrid.innerHTML = featured.map(ev => `
      <div class="card" onclick="loadEventDetail(${ev.id})">
        <div>
          <div style="display:flex; justify-content:space-between; margin-bottom: 0.8rem;">
            <span class="badge badge-${ev.status.replace(' ', '-')}">${ev.status}</span>
            <span class="entry-tag ${ev.price > 0 ? 'entry-paid' : 'entry-free'}">${ev.price > 0 ? '₹' + ev.price : 'FREE ENTRY'}</span>
          </div>
          <h3 style="font-size: 1.3rem; font-weight:800; margin-bottom: 0.3rem;">${ev.title}</h3>
          <p style="color:var(--text-muted); font-size: 0.85rem; margin-bottom: 1.25rem;">📍 ${ev.venue} • 🗓️ ${ev.date_str}</p>
        </div>
      </div>
    `).join('');
  }

  const moreEventsList = document.getElementById("home-more-events");
  if (moreEventsList) {
    moreEventsList.replaceChildren();
    const moreEvents = activeEvents.slice(2, 5);
    if (moreEvents.length === 0) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "home-empty-message";
      emptyMessage.textContent = activeEvents.length ? "More campus events will appear here." : "No events are published yet.";
      moreEventsList.append(emptyMessage);
    }
    moreEvents.forEach(event => {
      const eventButton = document.createElement("button");
      eventButton.type = "button";
      eventButton.className = "home-event-row";
      eventButton.addEventListener("click", () => loadEventDetail(event.id));

      const details = document.createElement("span");
      details.className = "home-event-details";
      const title = document.createElement("strong");
      title.textContent = event.title;
      const metadata = document.createElement("small");
      metadata.textContent = `${event.category} · ${event.date_str} · ${event.venue}`;
      details.append(title, metadata);

      const fee = document.createElement("span");
      fee.className = event.price > 0 ? "home-event-fee paid" : "home-event-fee";
      fee.textContent = event.price > 0 ? `₹${event.price}` : "Free";
      eventButton.append(details, fee);
      moreEventsList.append(eventButton);
    });
  }

  const homeHostList = document.getElementById("home-host-list");
  if (homeHostList) {
    homeHostList.replaceChildren();
    const hostCounts = new Map();
    activeEvents.forEach(event => hostCounts.set(event.category, (hostCounts.get(event.category) || 0) + 1));
    [...hostCounts.entries()].sort(([first], [second]) => first.localeCompare(second)).forEach(([category, count]) => {
      const hostButton = document.createElement("button");
      hostButton.type = "button";
      hostButton.className = "home-host-button";
      hostButton.addEventListener("click", () => browseHostCategory(category));
      const name = document.createElement("span");
      name.textContent = category;
      const eventCount = document.createElement("span");
      eventCount.className = "home-host-count";
      eventCount.textContent = `${count} ${count === 1 ? "event" : "events"}`;
      hostButton.append(name, eventCount);
      homeHostList.append(hostButton);
    });
    if (hostCounts.size === 0) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "home-empty-message";
      emptyMessage.textContent = "Department and club listings will appear here.";
      homeHostList.append(emptyMessage);
    }
  }
}

function setupParallax() {
  const hero = document.getElementById("hero-box");
  if (!hero) return;
  window.addEventListener("scroll", () => {
    const scrollY = window.pageYOffset;
    if (scrollY < 500) {
      hero.style.transform = `translate3d(0, ${scrollY * 0.08}px, 0)`;
    }
  }, { passive: true });
}

window.addEventListener("DOMContentLoaded", initApp);