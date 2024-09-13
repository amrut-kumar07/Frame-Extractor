import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

@Component({
  selector: 'app-video-frame-extractor',
  templateUrl: './video-frame-extractor.component.html',
})
export class VideoFrameExtractorComponent implements OnInit {
  private ffmpeg: FFmpeg | null = null;
  private framesArray: Uint8Array[] = [];
  showCombineButton = false;
  message = '';
  @ViewChild('framesContainer', { static: false }) framesContainer!: ElementRef<HTMLDivElement>;

  constructor(private cdr: ChangeDetectorRef) {}

  async ngOnInit() {
    this.message = 'Initializing FFmpeg...';
    this.ffmpeg = new FFmpeg();
  
    this.ffmpeg.on('log', ({ message }) => {
      console.log('FFmpeg Log:', message);
      this.message = `FFmpeg Log: ${message}`;
      this.cdr.detectChanges();
    });
  
    this.ffmpeg.on('progress', ({ progress, time }) => {
      const progressMessage = `Loading: ${(progress * 100).toFixed(2)}%, time: ${(time / 1000000).toFixed(2)} s`;
      console.log(progressMessage);
      this.message = progressMessage;
      this.cdr.detectChanges();
    });

    try {
      console.time('FFmpeg Load Time');
      this.message = 'Starting to load FFmpeg core...';
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`/assets/ffmpeg/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`/assets/ffmpeg/ffmpeg-core.wasm`, 'application/wasm'),
        classWorkerURL: '/assets/ffmpeg/worker.js'
      });
      console.timeEnd('FFmpeg Load Time');
      this.message = 'FFmpeg core loaded successfully';
    } catch (error) {
      console.error('Error loading FFmpeg:', error);
      this.message = `Error loading FFmpeg: ${error || 'Unknown error'}`;
    }
  
    this.cdr.detectChanges();
  }

  async onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.ffmpeg) return;

    this.framesArray = [];
    this.message = 'Start extracting frames';
    this.cdr.detectChanges();

    const start = new Date().getTime();
    await this.ffmpeg.writeFile(file.name, await fetchFile(file));
    await this.ffmpeg.exec(['-i', file.name, '-vf', 'fps=10', 'frame_%03d.bmp']);
    const end = new Date().getTime();

    alert(`Frames extracted in ${(end - start) / 1000} seconds.`);
    this.message = 'Complete extracting frames';

    for (let i = 1; ; i++) {
      try {
        const frameName = `frame_${i.toString().padStart(3, '0')}.bmp`;
        const data = await this.ffmpeg.readFile(frameName);
        this.framesArray.push(data as Uint8Array);
      } catch (e) {
        alert(`${i - 1} frames found and stored.`);
        break;
      }
    }

    await this.processFrames();

    this.showCombineButton = true;
    this.cdr.detectChanges();
  }

  async processFrames() {
    this.message = 'Processing frames';
    this.cdr.detectChanges();

    try {
      for (let i = 0; i < this.framesArray.length; i++) {
        const frameName = `frame_${i.toString().padStart(3, '0')}.bmp`;
        const processedFrameName = `processed_${frameName}`;
        
        console.log(`Processing frame ${i + 1} of ${this.framesArray.length}`);

        // Write the original frame
        await this.ffmpeg?.writeFile(frameName, this.framesArray[i]);

        // Draw rectangle on the frame
        try {
          await this.ffmpeg?.exec([
            '-i', frameName,
            '-vf', 'drawbox=x=938:y=155:w=28:h=28:color=green@1:t=4',
            processedFrameName
          ]);
        } catch (error) {
          console.error(`Error processing frame ${i}:`, error);
          continue;
        }

        // Read the processed frame back
        try {
          const processedData = await this.ffmpeg?.readFile(processedFrameName);
          this.framesArray[i] = processedData as Uint8Array;
        } catch (error) {
          console.error(`Error reading processed frame ${i}:`, error);
        }

        // Update progress
        this.message = `Processed frame ${i + 1} of ${this.framesArray.length}`;
        this.cdr.detectChanges();
      }

      this.message = 'Frames processed';
    } catch (error) {
      console.error('Error in processFrames:', error);
      this.message = 'Error processing frames';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async combineFramesToVideo() {
    if (this.framesArray.length === 0 || !this.ffmpeg) {
      alert("No frames to combine!");
      return;
    }

    this.message = 'Start combining frames into video';
    this.cdr.detectChanges();

    console.time('combine');
    for (let i = 0; i < this.framesArray.length; i++) {
      const frameName = `processed_frame_${i.toString().padStart(3, '0')}.bmp`;
      await this.ffmpeg.writeFile(frameName, this.framesArray[i]);
    }

    await this.ffmpeg.exec([
      '-framerate', '10',
      '-i', 'processed_frame_%03d.bmp',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'ultrafast',
      '-r', '10',
      'output.mp4'
    ]);

    console.timeEnd('combine');
    this.message = 'Complete combining frames into video';

    const data: any = await this.ffmpeg.readFile('output.mp4');
    const video = document.createElement('video');
    video.controls = true;
    video.src = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));

    this.framesContainer.nativeElement.innerHTML = '';
    this.framesContainer.nativeElement.appendChild(video);

    this.cdr.detectChanges();
  }
}