document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('wf-form-Campaign-Workshops');
    const submitButton = document.getElementById('workshop-btn');

    if (form && submitButton) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(form);
            const data = {};
            
            for (let [key, value] of formData.entries()) {
                data[key] = value;
            }
            
            fetch('/api/workspace/submit-workspace-form', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
        });
    }
}); 