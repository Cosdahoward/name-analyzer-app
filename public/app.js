document.getElementById('analyze-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nameInput = document.getElementById('name').value.trim();
    const genderInput = document.querySelector('input[name="gender"]:checked').value;
    const zodiacSelect = document.getElementById('zodiac');
    const zodiacInput = zodiacSelect.options[zodiacSelect.selectedIndex].text; // 取得 生肖文字
    const submitBtn = document.getElementById('submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    const resultContainer = document.getElementById('result-container');
    const resultContent = document.getElementById('result-content');
    const errorPanel = document.getElementById('error-message');

    // Reset UI
    errorPanel.classList.add('hidden');
    resultContainer.classList.add('hidden');
    resultContent.innerHTML = '';
    
    // Loading State
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-block';

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: nameInput, gender: genderInput, zodiac: zodiacInput })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '伺服器發生錯誤。');
        }

        // Display results
        resultContent.innerHTML = formatMarkdown(data.analysis);
        resultContainer.classList.remove('hidden');
        
        // Scroll to results smoothly
        setTimeout(() => {
            resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);

    } catch (error) {
        errorPanel.querySelector('p').textContent = error.message;
        errorPanel.classList.remove('hidden');
    } finally {
        // Reset Loading State
        submitBtn.disabled = false;
        btnText.style.display = 'inline-block';
        btnLoader.style.display = 'none';
    }
});

// Simple Markdown to HTML formatter for the generated analysis
function formatMarkdown(text) {
    let formatted = text
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')
        // Bullets (very basic)
        .replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>')
        .replace(/<\/ul>\n<ul>/gim, '')
        // Numbers
        .replace(/^(\d+)\. (.*$)/gim, '<ol><li>$2</li></ol>')
        .replace(/<\/ol>\n<ol>/gim, '')
        // Paragraphs
        .replace(/\n\n/gim, '</p><p>')
        .replace(/\n/gim, '<br>');
    
    return `<p>${formatted}</p>`;
}
