import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

const execPromise = promisify(exec);

export async function POST(req: Request) {
  // Use a timestamp to prevent file conflicts if multiple users compile at once
  const timestamp = Date.now();
  const sketchDir = path.join(process.cwd(), `temp_sketch_${timestamp}`);
  
  try {
    const { code, mode = 'esp32' } = await req.json();
    if (!code) return Response.json({ error: "No code provided" }, { status: 400 });

    const buildDir = path.join(sketchDir, 'build');
    const sketchName = `temp_sketch_${timestamp}`;
    const sketchPath = path.join(sketchDir, `${sketchName}.ino`);

    // 1. Create isolated temporary directories
    await fs.mkdir(sketchDir, { recursive: true });
    await fs.mkdir(buildDir, { recursive: true });
    
    // 2. Apply ESP32 Core v3 sanitization
    let sanitizedCode = code
      .replace(/ledcSetup\s*\([^;]+;/g, '// ledcSetup removed')
      .replace(/ledcAttachPin\s*\(\s*([^,]+)\s*,\s*[^)]+\);/g, 'ledcAttach($1, 5000, 8);')
      .replace(/ledcWrite\s*\(\s*(0|LED_CHANNEL)\s*,/g, 'ledcWrite(LED_PIN,');

    await fs.writeFile(sketchPath, sanitizedCode);

    // 3. Set the correct board target
    const fqbn = mode === 'arduino' ? 'arduino:avr:uno' : 'esp32:esp32:esp32';

    // 4. Compile the sketch and output the binary to the build directory
    const compileCmd = `arduino-cli compile --fqbn ${fqbn} --output-dir "${buildDir}" "${sketchDir}"`;
    await execPromise(compileCmd);

    // 5. Read the compiled firmware file (.bin for ESP32, .hex for Arduino)
    const firmwareName = mode === 'arduino' ? `${sketchName}.ino.hex` : `${sketchName}.ino.bin`;
    const firmwarePath = path.join(buildDir, firmwareName);
    const fileBuffer = await fs.readFile(firmwarePath);

    // 6. Clean up temporary files instantly
    await fs.rm(sketchDir, { recursive: true, force: true });

    // 7. Return the raw binary file as an octet-stream so the frontend can flash it
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${firmwareName}"`,
      },
    });

  } catch (error: any) {
    // Ensure cleanup happens even if compilation fails (prevents server storage bloat)
    await fs.rm(sketchDir, { recursive: true, force: true }).catch(() => {});
    return Response.json({ error: `Compilation Failed:\n${error.message}` }, { status: 500 });
  }
}