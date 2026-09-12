const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const fileListEl = document.getElementById('fileList');
const convertBtn = document.getElementById('convertBtn');             
const formatSelect = document.getElementById('format');             
const qualityInput = document.getElementById('quality');             
const qualityValue = document.getElementById('qualityValue');             
const qualityGroup = document.getElementById('qualityGroup');             
const statusEl = document.getElementById('status');             
             
let selectedFiles = [];
const IMAGE_EXT = /\.(png|jpe?g|webp|avif|tiff?|gif|bmp)$/i;

function updateFileList() {
    fileListEl.innerHTML = '';
    if (selectedFiles.length === 0) { convertBtn.disabled = true; return;}
    convertBtn.disabled = false;
    const summary = document.createElement('div');
    summary.textContent = `${selectedFiles.length} image(s) selected`
    summary.style.fontWeight = '600';
    summary.style.color = 'var(--text)';
    fileListEl.appendChild(summary);
    selectedFiles.slice(0,50).forEach((f) => {
        const div = document.createElement('div');
        div.textContent = f.webkitRelativePath || f.name;
        fileListEl.appendChild(div);
    });
    if (selectedFiles.length> 50) {
        const div = document.createElement('div');
        div.textContent = `...and ${selectedFiles.length - 50} more`;
        fileListEl.appendChild(div);
    }
}

function addFiles(fileArray) {
    selectedFiles = fileArray.filter((f) => IMAGE_EXT.test(f.name));
    updateFileList();
    statusEl.textContent = '';
    statusEl.className = 'status';
}

['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('dragover');});
    });

['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('dragover');});
});

dropzone.addEventListener('drop', async (e) => {
    const items = e.dataTransfer.items;
    const files = [];

    async function traverse(entry, path = '') {
        if (entry.isFile) {
            await new Promise((resolve) => {
                entry.file((file) => {
                    Object.defineProperty(file, 'webkitRelativePath', { value: path + file.name });
                    files.push(file);
                    resolve();
                });
            });
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            const entries = await new Promise((resolve) => reader.readEntries(resolve));
            for (const child of entries) await traverse(child, path + entry.name + '/');
        }
    }

    const entries = [];
    for (let i =0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
        if (entry) entries.push(entry);
    }

    if(entries.length > 0) {
        for(const entry of entries) await traverse(entry);
        addFiles(files);
    } else {
        addFiles(Array.from(e.dataTransfer.files));
    }
});

fileInput.addEventListener('change', () => addFiles(Array.from(fileInput.files)));
folderInput.addEventListener('change', () => addFiles(Array.from(folderInput.files)));
qualityInput.addEventListener('input', () => { qualityValue.textContent = qualityInput.value});
formatSelect.addEventListener('change', () => {
    qualityGroup.style.display = formatSelect.value === 'png' ? 'none' : 'block';
});

convertBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0 ) return;
    convertBtn.disabled = true;
    statusEl.className = 'status';
    statusEl.textContent = `Converting ${selectedFiles.length} image(s)...`;

    const formData = new FormData();
    const fromFolder = selectedFiles.some((f) => (f.webkitRelativePath || '').replace(/\\/g, '/').includes('/'));
    selectedFiles.forEach((f) => {
        const name = f.webkitRelativePath || f.name;
        formData.append('images', f, f.name);
        formData.append('paths', name);
    });
    formData.append('zip', (selectedFiles.length > 1 || fromFolder) ? '1' : '0');
    formData.append('format', formatSelect.value);
    formData.append('quality', qualityInput.value);

    try {
        const res = await fetch('/convert', {method: 'POST', body: formData});
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Conversion failed' }));
            throw new Error(err.error || 'Conversion failed');
        }
        const blob = await res.blob();
        const header = res.headers.get('Content-Disposition') || '';
        const utfMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
        const plainMatch = header.match(/filename="([^"]+)"/i) || header.match(/filename=([^;]+)/i);
        const downloadName = utfMatch
            ? decodeURIComponent(utfMatch[1])
            : (plainMatch ? plainMatch[1] : 'converted-images.zip');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        statusEl.className = 'status success';
        statusEl.textContent = `Done! Downloaded ${downloadName}.`;

    } catch (err) {
        statusEl.className = 'status error';
        statusEl.textContent = `Error: ${err.message}`;
    } finally {
        convertBtn.disabled = false;
    }
});