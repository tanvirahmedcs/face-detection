const registerVideo = document.getElementById('register-video');
const attendanceVideo = document.getElementById('attendance-video');
const startRegisterBtn = document.getElementById('start-register');
const captureRegisterBtn = document.getElementById('capture-register');
const startAttendanceBtn = document.getElementById('start-attendance');
const captureAttendanceBtn = document.getElementById('capture-attendance');
const registerStatus = document.getElementById('register-status');
const attendanceStatus = document.getElementById('attendance-status');
const studentIdInput = document.getElementById('student-id');
const studentNameInput = document.getElementById('student-name');
const studentDepartmentInput = document.getElementById('student-department');
const recordsList = document.getElementById('records-list');
const refreshRecordsBtn = document.getElementById('refresh-records');
const exportAttendanceBtn = document.getElementById('export-attendance-btn');

const teacherLoginSection = document.getElementById('teacher-login-section');
const registerSection = document.getElementById('register-section');
const teacherUsernameInput = document.getElementById('teacher-username');
const teacherPasswordInput = document.getElementById('teacher-password');
const teacherLoginBtn = document.getElementById('teacher-login-btn');
const teacherLogoutBtn = document.getElementById('teacher-logout-btn');
const teacherLoginStatus = document.getElementById('teacher-login-status');

let registerStream = null;
let attendanceStream = null;

function startWebcam(videoElement, startButton, captureButton) {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                videoElement.srcObject = stream;
                if (videoElement === registerVideo) {
                    registerStream = stream;
                } else if (videoElement === attendanceVideo) {
                    attendanceStream = stream;
                }
                captureButton.disabled = false;
                startButton.disabled = true;
            })
            .catch(err => {
                alert('Error accessing webcam: ' + err);
            });
    } else {
        alert('getUserMedia not supported in this browser.');
    }
}

function captureImage(videoElement) {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg').split(',')[1]; // base64 string without prefix
}

startRegisterBtn.addEventListener('click', () => {
    startWebcam(registerVideo, startRegisterBtn, captureRegisterBtn);
});

captureRegisterBtn.addEventListener('click', () => {
    const studentId = studentIdInput.value.trim();
    const name = studentNameInput.value.trim();
    const department = studentDepartmentInput.value.trim();
    if (!studentId || !name) {
        registerStatus.textContent = 'Please enter student ID and name.';
        return;
    }
    // Basic input validation for student ID and name length
    if (studentId.length < 3 || name.length < 2) {
        registerStatus.textContent = 'Student ID must be at least 3 characters and name at least 2 characters.';
        return;
    }
    const imageBase64 = captureImage(registerVideo);
    registerStatus.textContent = 'Registering...';

    fetch('http://localhost:5000/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, name: name, department: department, image: imageBase64 })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            registerStatus.textContent = 'Error: ' + data.error;
        } else {
            registerStatus.textContent = data.message;
            studentIdInput.value = '';
            studentNameInput.value = '';
            studentDepartmentInput.value = '';
        }
    })
    .catch(err => {
        registerStatus.textContent = 'Error: ' + err;
    });
});

startAttendanceBtn.addEventListener('click', () => {
    startWebcam(attendanceVideo, startAttendanceBtn, captureAttendanceBtn);
});

captureAttendanceBtn.addEventListener('click', () => {
    const imageBase64 = captureImage(attendanceVideo);
    attendanceStatus.textContent = 'Marking attendance...';

    fetch('http://localhost:5000/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageBase64 })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            attendanceStatus.textContent = 'Error: ' + data.error;
        } else {
            attendanceStatus.textContent = data.message + ' at ' + data.timestamp;
            loadAttendanceRecords();
        }
    })
    .catch(err => {
        attendanceStatus.textContent = 'Error: ' + err;
    });
});

function loadAttendanceRecords() {
    fetch('http://localhost:5000/attendance_records')
    .then(res => res.json())
    .then(data => {
        recordsList.innerHTML = '';
        if (data.length === 0) {
            recordsList.innerHTML = '<li>No attendance records found.</li>';
            return;
        }
        data.forEach(record => {
            const li = document.createElement('li');
            li.textContent = record.student_id + ' - ' + record.name + ' (' + record.department + ') - ' + new Date(record.timestamp).toLocaleString();
            recordsList.appendChild(li);
        });
    })
    .catch(err => {
        recordsList.innerHTML = '<li>Error loading records: ' + err + '</li>';
    });
}

refreshRecordsBtn.addEventListener('click', loadAttendanceRecords);

// Load records on page load
loadAttendanceRecords();

teacherLoginBtn.addEventListener('click', () => {
    const username = teacherUsernameInput.value.trim();
    const password = teacherPasswordInput.value.trim();
    if (!username || !password) {
        teacherLoginStatus.textContent = 'Please enter username and password.';
        return;
    }
    // Basic input validation for username and password length
    if (username.length < 3 || password.length < 6) {
        teacherLoginStatus.textContent = 'Username must be at least 3 characters and password at least 6 characters.';
        return;
    }
    teacherLoginStatus.textContent = 'Logging in...';

    fetch('http://localhost:5000/teacher_login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            teacherLoginStatus.textContent = 'Error: ' + data.error;
        } else {
            teacherLoginStatus.textContent = data.message;
            teacherLoginBtn.style.display = 'none';
            teacherLogoutBtn.style.display = 'inline-block';
            teacherLoginSection.style.display = 'none';
            registerSection.style.display = 'block';
        }
    })
    .catch(err => {
        teacherLoginStatus.textContent = 'Error: ' + err;
    });
});

teacherLogoutBtn.addEventListener('click', () => {
    fetch('http://localhost:5000/teacher_logout', {
        method: 'POST'
    })
    .then(res => res.json())
    .then(data => {
        teacherLoginStatus.textContent = data.message;
        teacherLoginBtn.style.display = 'inline-block';
        teacherLogoutBtn.style.display = 'none';
        teacherLoginSection.style.display = 'block';
        registerSection.style.display = 'none';
    })
    .catch(err => {
        teacherLoginStatus.textContent = 'Error: ' + err;
    });
});

exportAttendanceBtn.addEventListener('click', () => {
    fetch('http://localhost:5000/export_attendance')
    .then(res => {
        if (!res.ok) {
            throw new Error('Failed to export attendance. Please login as teacher.');
        }
        return res.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'attendance_records.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    })
    .catch(err => {
        alert(err.message);
    });
});
