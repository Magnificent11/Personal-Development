// Get form elements
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const createAccountLink = document.querySelector('.create-account-link');
const backToLoginLink = document.querySelector('.back-to-login-link');

// Toggle to signup form
createAccountLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.remove('active');
    signupForm.classList.add('active');
    clearFormErrors(loginForm);
});

// Toggle back to login form
backToLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    signupForm.classList.remove('active');
    loginForm.classList.add('active');
    clearFormErrors(signupForm);
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
function isValidUsername(username) {
    // At least 3 characters
    return username.length >= 3;
}

function isValidPassword(password) {
    // At least 6 characters
    return password.length >= 6;
}

function isValidName(name) {
    // At least 2 characters
    return name.length >= 2;
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
    
    const username = document.getElementById('loginUsername');
    const password = document.getElementById('loginPassword');
    const submitBtn = loginForm.querySelector('.submit-btn');
    
    let isValid = true;
    
    // Clear previous errors
    clearFormErrors(loginForm);
    
    // Validate username
    if (!username.value.trim()) {
        showError(username, 'Username is required');
        isValid = false;
    } else if (!isValidUsername(username.value.trim())) {
        showError(username, 'Username must be at least 3 characters');
        isValid = false;
    }
    
    // Validate password
    if (!password.value) {
        showError(password, 'Password is required');
        isValid = false;
    }
    
    if (!isValid) return;
    
    // Disable button during submission
    submitBtn.disabled = true;
    
    // Prepare data for backend
    const formData = {
        username: username.value.trim(),
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
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Success handling
        console.log('Login successful:', formData);
        // TODO: Handle successful login (redirect, store token, etc.)
        // window.location.href = '/dashboard';
        
    } catch (error) {
        console.error('Login error:', error);
        showError(password, 'Invalid username or password');
    } finally {
        // Reset button state
        submitBtn.disabled = false;
    }
});

// Signup Form Submission
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const firstName = document.getElementById('signupFirstName');
    const lastName = document.getElementById('signupLastName');
    const username = document.getElementById('signupUsername');
    const password = document.getElementById('signupPassword');
    const submitBtn = signupForm.querySelector('.submit-btn');
    
    let isValid = true;
    
    // Clear previous errors
    clearFormErrors(signupForm);
    
    // Validate first name
    if (!firstName.value.trim()) {
        showError(firstName, 'First name is required');
        isValid = false;
    } else if (!isValidName(firstName.value.trim())) {
        showError(firstName, 'First name must be at least 2 characters');
        isValid = false;
    }
    
    // Validate last name
    if (!lastName.value.trim()) {
        showError(lastName, 'Last name is required');
        isValid = false;
    } else if (!isValidName(lastName.value.trim())) {
        showError(lastName, 'Last name must be at least 2 characters');
        isValid = false;
    }
    
    // Validate username
    if (!username.value.trim()) {
        showError(username, 'Username is required');
        isValid = false;
    } else if (!isValidUsername(username.value.trim())) {
        showError(username, 'Username must be at least 3 characters');
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
    
    if (!isValid) return;
    
    // Disable button during submission
    submitBtn.disabled = true;
    
    // Prepare data for backend
    const formData = {
        firstName: firstName.value.trim(),
        lastName: lastName.value.trim(),
        username: username.value.trim(),
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
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Success handling
        console.log('Signup successful:', formData);
        // TODO: Handle successful signup (redirect, store token, etc.)
        // window.location.href = '/dashboard';
        
    } catch (error) {
        console.error('Signup error:', error);
        showError(username, 'An error occurred. Please try again.');
    } finally {
        // Reset button state
        submitBtn.disabled = false;
    }
});

// Forgot Password Link
document.querySelector('.forgot-link').addEventListener('click', (e) => {
    e.preventDefault();
    // TODO: Implement forgot password functionality
    console.log('Forgot password clicked');
    alert('Forgot password functionality - connect to your backend');
});