// Toggle between Login and Signup
const authToggles = document.querySelectorAll('.auth-toggle');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');

authToggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
        const mode = toggle.dataset.mode;
        
        // Update active states
        authToggles.forEach(t => t.classList.remove('active'));
        toggle.classList.add('active');
        
        // Switch forms
        if (mode === 'login') {
            loginForm.classList.add('active');
            signupForm.classList.remove('active');
            clearFormErrors(signupForm);
        } else {
            signupForm.classList.add('active');
            loginForm.classList.remove('active');
            clearFormErrors(loginForm);
        }
    });
});

// Password Toggle Functionality
const togglePasswordButtons = document.querySelectorAll('.toggle-password');

togglePasswordButtons.forEach(button => {
    button.addEventListener('click', () => {
        const wrapper = button.closest('.password-wrapper');
        const input = wrapper.querySelector('input');
        const eyeIcon = button.querySelector('.eye-icon');
        const eyeOffIcon = button.querySelector('.eye-off-icon');
        
        if (input.type === 'password') {
            input.type = 'text';
            eyeIcon.classList.add('hidden');
            eyeOffIcon.classList.remove('hidden');
        } else {
            input.type = 'password';
            eyeIcon.classList.remove('hidden');
            eyeOffIcon.classList.add('hidden');
        }
    });
});

// Validation Functions
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidPassword(password) {
    // At least 6 characters
    return password.length >= 6;
}

function showError(input, message) {
    const inputGroup = input.closest('.input-group');
    const errorMessage = inputGroup.querySelector('.error-message');
    
    input.classList.add('error');
    errorMessage.textContent = message;
}

function clearError(input) {
    const inputGroup = input.closest('.input-group');
    const errorMessage = inputGroup.querySelector('.error-message');
    
    input.classList.remove('error');
    errorMessage.textContent = '';
}

function clearFormErrors(form) {
    const inputs = form.querySelectorAll('input');
    inputs.forEach(input => clearError(input));
}

// Real-time validation on input
document.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => {
        if (input.classList.contains('error')) {
            clearError(input);
        }
    });
});

// Login Form Submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail');
    const password = document.getElementById('loginPassword');
    const submitBtn = loginForm.querySelector('.submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    
    let isValid = true;
    
    // Clear previous errors
    clearFormErrors(loginForm);
    
    // Validate email
    if (!email.value.trim()) {
        showError(email, 'Email is required');
        isValid = false;
    } else if (!isValidEmail(email.value.trim())) {
        showError(email, 'Please enter a valid email address');
        isValid = false;
    }
    
    // Validate password
    if (!password.value) {
        showError(password, 'Password is required');
        isValid = false;
    }
    
    if (!isValid) return;
    
    // Show loading state
    submitBtn.disabled = true;
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    
    // Prepare data for backend
    const formData = {
        email: email.value.trim(),
        password: password.value
    };
    
    try {
        // TODO: Replace with your actual API endpoint
        // const response = await fetch('/api/auth/login', {
        //     method: 'POST',
        //     headers: {
        //         'Content-Type': 'application/json',
        //     },
        //     body: JSON.stringify(formData)
        // });
        
        // const data = await response.json();
        
        // Simulate API call for now
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Success handling
        console.log('Login successful:', formData);
        // TODO: Handle successful login (redirect, store token, etc.)
        // window.location.href = '/dashboard';
        
    } catch (error) {
        console.error('Login error:', error);
        showError(password, 'Invalid email or password');
    } finally {
        // Reset button state
        submitBtn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
    }
});

// Signup Form Submission
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('signupName');
    const email = document.getElementById('signupEmail');
    const password = document.getElementById('signupPassword');
    const confirmPassword = document.getElementById('signupConfirmPassword');
    const submitBtn = signupForm.querySelector('.submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    
    let isValid = true;
    
    // Clear previous errors
    clearFormErrors(signupForm);
    
    // Validate name
    if (!name.value.trim()) {
        showError(name, 'Name is required');
        isValid = false;
    } else if (name.value.trim().length < 2) {
        showError(name, 'Name must be at least 2 characters');
        isValid = false;
    }
    
    // Validate email
    if (!email.value.trim()) {
        showError(email, 'Email is required');
        isValid = false;
    } else if (!isValidEmail(email.value.trim())) {
        showError(email, 'Please enter a valid email address');
        isValid = false;
    }
    
    // Validate password
    if (!password.value) {
        showError(password, 'Password is required');
        isValid = false;
    } else if (!isValidPassword(password.value)) {
        showError(password, 'Password must be at least 6 characters');
        isValid = false;
    }
    
    // Validate confirm password
    if (!confirmPassword.value) {
        showError(confirmPassword, 'Please confirm your password');
        isValid = false;
    } else if (password.value !== confirmPassword.value) {
        showError(confirmPassword, 'Passwords do not match');
        isValid = false;
    }
    
    if (!isValid) return;
    
    // Show loading state
    submitBtn.disabled = true;
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    
    // Prepare data for backend
    const formData = {
        name: name.value.trim(),
        email: email.value.trim(),
        password: password.value
    };
    
    try {
        // TODO: Replace with your actual API endpoint
        // const response = await fetch('/api/auth/signup', {
        //     method: 'POST',
        //     headers: {
        //         'Content-Type': 'application/json',
        //     },
        //     body: JSON.stringify(formData)
        // });
        
        // const data = await response.json();
        
        // Simulate API call for now
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Success handling
        console.log('Signup successful:', formData);
        // TODO: Handle successful signup (redirect, store token, etc.)
        // window.location.href = '/dashboard';
        
    } catch (error) {
        console.error('Signup error:', error);
        showError(email, 'An error occurred. Please try again.');
    } finally {
        // Reset button state
        submitBtn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
    }
});

// Forgot Password Link
document.querySelector('.forgot-link').addEventListener('click', (e) => {
    e.preventDefault();
    // TODO: Implement forgot password functionality
    console.log('Forgot password clicked');
    alert('Forgot password functionality - connect to your backend');
});