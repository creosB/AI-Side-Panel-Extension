document.addEventListener('DOMContentLoaded', function() {
    const buttons = document.querySelectorAll('.btn[data-url]');
    const iframe = document.querySelector('iframe');
    const supportBtn = document.getElementById('support-btn');
    const supportPage = document.getElementById('support-page');

    buttons.forEach(button => {
        button.addEventListener('click', function() {
            const url = this.getAttribute('data-url');
            iframe.src = url;
            iframe.style.display = 'block';
            supportPage.style.display = 'none';
        });
    });

    supportBtn.addEventListener('click', function() {
        iframe.style.display = 'none';
        supportPage.style.display = 'flex';
    });
});