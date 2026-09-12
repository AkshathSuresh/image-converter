import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { ZipArchive } from 'archiver';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3737;

const upload = multer({ storage: multer.memoryStorage() });
app.use(express.static(path.join(__dirname, 'public')));

const VALID_FORMATS = ['png', 'jpeg', 'jpg', 'webp', 'avif', 'tiff'];

const MIME_TYPES = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif',
    tiff: 'image/tiff',
};

function outputName(relPath, targetFormat) {
    const parsed = path.parse(String(relPath).replace(/\\/g, '/'));
    return `${parsed.dir ? parsed.dir + '/' : ''}${parsed.name}.${targetFormat}`;
}

function asArray(value) {
    if (value == null || value === '') return [];
    return Array.isArray(value) ? value : [value];
}

function fileRelPath(file, index, paths) {
    return paths[index] || file.originalname;
}

function shouldZip(files, zipFlag, paths) {
    if (zipFlag === '1' || zipFlag === 'true') return true;
    if (files.length > 1) return true;
    const name = String(fileRelPath(files[0], 0, paths) || '').replace(/\\/g, '/');
    return name.includes('/');
}

async function convertBuffer(buffer, sharpFormat, quality) {
    let pipeline = sharp(buffer, { failOn: 'none' });
    if (sharpFormat === 'jpeg') pipeline = pipeline.jpeg({ quality });
    else if (sharpFormat === 'webp') pipeline = pipeline.webp({ quality });
    else if (sharpFormat === 'avif') pipeline = pipeline.avif({ quality });
    else if (sharpFormat === 'tiff') pipeline = pipeline.tiff({ quality });
    else if (sharpFormat === 'png') pipeline = pipeline.png();
    return pipeline.toBuffer();
}

app.post('/convert', upload.array('images'), async (req, res) => {
    try {
        const targetFormat = (req.body.format || 'png').toLowerCase();
        const quality = parseInt(req.body.quality, 10) || 80;

        if (!VALID_FORMATS.includes(targetFormat)) {
            return res.status(400).json({ error: `Unsupported format: ${targetFormat}` });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const sharpFormat = targetFormat === 'jpg' ? 'jpeg' : targetFormat;
        const paths = asArray(req.body.paths);

        if (!shouldZip(req.files, req.body.zip, paths)) {
            const file = req.files[0];
            const filename = path.basename(outputName(fileRelPath(file, 0, paths), targetFormat));
            const outputBuffer = await convertBuffer(file.buffer, sharpFormat, quality);
            res.setHeader('Content-Type', MIME_TYPES[targetFormat] || 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send(outputBuffer);
        }

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="converted-images.zip"');

        const archive = new ZipArchive({ zlib: { level: 9 } });
        archive.pipe(res);

        for (const [index, file] of req.files.entries()) {
            const relPath = fileRelPath(file, index, paths);
            try {
                const outName = outputName(relPath, targetFormat);
                const outputBuffer = await convertBuffer(file.buffer, sharpFormat, quality);
                archive.append(outputBuffer, { name: outName });
            } catch (err) {
                archive.append(`Failed to convert ${relPath}: ${err.message}`, {
                    name: `${relPath}.ERROR.txt`,
                });
            }
        }
        await archive.finalize();
    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Image converter running at http://localhost:${PORT}`);
});
