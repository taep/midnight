'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Agent as AgentClass } from '@/lib/simulation/Agent';
import { GameState, AnnouncementStyle, CameraEvent } from '@/lib/simulation/types';

interface AnnouncementData {
    text: string;
    style: AnnouncementStyle;
}

interface WorldCanvasProps {
    agents: AgentClass[];
    width: number;
    height: number;
    onAgentClick: (agentId: string) => void;
    trigger: number;
    gameState: GameState;
    announcement: AnnouncementData | null;
    cameraEvents?: CameraEvent[];
}

const CELL_SIZE = 32;
const LERP_SPEED = 0.18;
const CAM_LERP = 0.06;
const CAM_RESET_LERP = 0.04;

// === Camera State (module-level for 60fps loop) ===
interface CameraState {
    // Current values (lerped)
    x: number;
    y: number;
    zoom: number;
    shakeX: number;
    shakeY: number;
    // Targets
    targetX: number;
    targetY: number;
    targetZoom: number;
    // Active effects
    zoomTimer: number;
    zoomDuration: number;
    shakeTimer: number;
    shakeIntensity: number;
    shakeDelay: number;
    // Label overlay
    label: string | null;
    labelAlpha: number;
}

function createCameraState(centerX: number, centerY: number): CameraState {
    return {
        x: centerX, y: centerY, zoom: 1, shakeX: 0, shakeY: 0,
        targetX: centerX, targetY: centerY, targetZoom: 1,
        zoomTimer: 0, zoomDuration: 0,
        shakeTimer: 0, shakeIntensity: 0, shakeDelay: 0,
        label: null, labelAlpha: 0,
    };
}

export default function WorldCanvas({ agents, width, height, onAgentClick, trigger, gameState, announcement, cameraEvents }: WorldCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const agentsRef = useRef(agents);
    const gameStateRef = useRef(gameState);
    const announcementRef = useRef(announcement);
    const cameraRef = useRef<CameraState>(createCameraState((width * CELL_SIZE) / 2, (height * CELL_SIZE) / 2));
    void trigger;

    useEffect(() => { agentsRef.current = agents; }, [agents]);
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
    useEffect(() => { announcementRef.current = announcement; }, [announcement]);

    // Process incoming camera events
    useEffect(() => {
        if (!cameraEvents || cameraEvents.length === 0) return;
        const cam = cameraRef.current;

        for (const evt of cameraEvents) {
            switch (evt.type) {
                case 'ZOOM_TO':
                    cam.targetX = (evt.targetX ?? 0) * CELL_SIZE + CELL_SIZE / 2;
                    cam.targetY = (evt.targetY ?? 0) * CELL_SIZE + CELL_SIZE / 2;
                    cam.targetZoom = evt.zoom ?? 2.0;
                    cam.zoomTimer = evt.duration;
                    cam.zoomDuration = evt.duration;
                    cam.label = evt.label ?? null;
                    cam.labelAlpha = 0;
                    break;
                case 'SHAKE':
                    cam.shakeIntensity = evt.intensity ?? 6;
                    cam.shakeTimer = evt.duration;
                    cam.shakeDelay = evt.delay ?? 0;
                    break;
                case 'SLOW_MO':
                    // Handled by page.tsx via World.slowMotionTicks
                    break;
                case 'RESET':
                    cam.targetZoom = 1;
                    cam.zoomTimer = 0;
                    cam.label = null;
                    break;
            }
        }
    }, [cameraEvents]);

    // Continuous 60fps animation loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = width * CELL_SIZE;
        canvas.height = height * CELL_SIZE;

        const canvasCenterX = canvas.width / 2;
        const canvasCenterY = canvas.height / 2;

        let animId: number;

        const animate = () => {
            const currentAgents = agentsRef.current;
            const gs = gameStateRef.current;
            const isActive = gs === 'ROUND_ACTIVE';
            const isGameOver = gs === 'GAME_OVER';
            const cam = cameraRef.current;

            // === Update Camera ===
            updateCamera(cam, canvasCenterX, canvasCenterY);

            // --- Lerp render positions ---
            currentAgents.forEach(agent => {
                agent.renderX += (agent.position.x - agent.renderX) * LERP_SPEED;
                agent.renderY += (agent.position.y - agent.renderY) * LERP_SPEED;
            });

            // --- Zombie ratio for atmosphere ---
            const zombieCount = currentAgents.filter(a => a.role === 'ZOMBIE').length;
            const zombieRatio = currentAgents.length > 0 ? zombieCount / currentAgents.length : 0;

            // === Apply Camera Transform ===
            ctx.save();
            ctx.translate(canvasCenterX, canvasCenterY);
            ctx.scale(cam.zoom, cam.zoom);
            ctx.translate(-cam.x + cam.shakeX, -cam.y + cam.shakeY);

            // === 1. Background ===
            // Need to fill larger area when zoomed out
            const bufferSize = Math.max(canvas.width, canvas.height) * 2;
            if (isActive || isGameOver) {
                const r = Math.floor(15 + zombieRatio * 25);
                const g = Math.floor(23 * (1 - zombieRatio * 0.8));
                const b = Math.floor(42 * (1 - zombieRatio * 0.7));
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            } else {
                ctx.fillStyle = '#0f172a';
            }
            ctx.fillRect(-bufferSize, -bufferSize, bufferSize * 3, bufferSize * 3);

            // === 2. Grid ===
            ctx.strokeStyle = isActive
                ? `rgba(${60 + zombieRatio * 80}, ${25 - zombieRatio * 15}, ${25 - zombieRatio * 15}, 0.2)`
                : 'rgba(30, 41, 59, 0.5)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            for (let x = 0; x <= width; x++) {
                ctx.moveTo(x * CELL_SIZE, 0);
                ctx.lineTo(x * CELL_SIZE, height * CELL_SIZE);
            }
            for (let y = 0; y <= height; y++) {
                ctx.moveTo(0, y * CELL_SIZE);
                ctx.lineTo(width * CELL_SIZE, y * CELL_SIZE);
            }
            ctx.stroke();

            // === 3. Atmosphere overlay ===
            if (isActive || isGameOver) {
                const grd = ctx.createRadialGradient(
                    canvas.width / 2, canvas.height / 2, canvas.width * 0.25,
                    canvas.width / 2, canvas.height / 2, canvas.width * 0.65
                );
                grd.addColorStop(0, 'transparent');
                grd.addColorStop(1, `rgba(0, 0, 0, ${0.2 + zombieRatio * 0.5})`);
                ctx.fillStyle = grd;
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                const time = performance.now() * 0.001;
                const pulse = Math.sin(time * 1.5) * 0.5 + 0.5;
                ctx.fillStyle = `rgba(150, 0, 0, ${zombieRatio * 0.06 * (0.7 + pulse * 0.3)})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            // === 4. Agents ===
            currentAgents.forEach(agent => {
                const cx = agent.renderX * CELL_SIZE + CELL_SIZE / 2;
                const cy = agent.renderY * CELL_SIZE + CELL_SIZE / 2;
                const radius = CELL_SIZE * 0.38;

                if (agent.status !== 'ALIVE') {
                    ctx.globalAlpha = 0.4;
                    ctx.fillStyle = '#555';
                    ctx.beginPath();
                    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;

                    ctx.font = '16px serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('\u{1F480}', cx, cy);
                    return;
                }

                // Glow
                ctx.save();
                ctx.shadowColor = agent.color;
                ctx.shadowBlur = agent.role === 'ZOMBIE'
                    ? 20 + Math.sin(performance.now() * 0.004) * 10
                    : 15;
                ctx.globalCompositeOperation = 'screen';
                ctx.fillStyle = agent.color;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                // Core body
                ctx.fillStyle = agent.color;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fill();

                // White highlight
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.beginPath();
                ctx.arc(cx - radius * 0.2, cy - radius * 0.2, radius * 0.35, 0, Math.PI * 2);
                ctx.fill();

                // Border ring
                ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.stroke();

                // Initial letter
                ctx.fillStyle = 'white';
                ctx.font = 'bold 13px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(agent.name[0], cx, cy + 1);

                // Name tag
                ctx.font = '10px sans-serif';
                const nameW = ctx.measureText(agent.name).width + 8;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
                ctx.fillRect(cx - nameW / 2, cy + radius + 5, nameW, 14);
                ctx.fillStyle = '#e2e8f0';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(agent.name, cx, cy + radius + 6);

                // Alliance color bar
                if (agent.allianceColor) {
                    ctx.fillStyle = agent.allianceColor;
                    ctx.fillRect(cx - nameW / 2, cy + radius + 19, nameW, 2);
                }

                // Speech bubble
                if (agent.currentMessage) {
                    drawBubble(ctx, cx, cy - radius - 8, agent.currentMessage);
                }
            });

            // === End Camera Transform ===
            ctx.restore();

            // === 5. Screen-space overlays (not affected by camera) ===

            // Zoom vignette (stronger when zoomed in)
            if (cam.zoom > 1.05) {
                const vignetteStrength = Math.min((cam.zoom - 1) * 0.4, 0.6);
                const grd = ctx.createRadialGradient(
                    canvasCenterX, canvasCenterY, canvas.width * 0.15,
                    canvasCenterX, canvasCenterY, canvas.width * 0.55
                );
                grd.addColorStop(0, 'transparent');
                grd.addColorStop(1, `rgba(0, 0, 0, ${vignetteStrength})`);
                ctx.fillStyle = grd;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            // Zoom label overlay (agent name during zoom)
            if (cam.label && cam.zoomTimer > 0) {
                cam.labelAlpha += (1 - cam.labelAlpha) * 0.08;
                // Fade out in last 30% of duration
                const fadePhase = cam.zoomTimer / cam.zoomDuration;
                const alpha = fadePhase < 0.3 ? fadePhase / 0.3 : 1;
                const finalAlpha = cam.labelAlpha * alpha * 0.85;

                ctx.save();
                ctx.globalAlpha = finalAlpha;
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';

                // Background pill
                const labelW = ctx.measureText(cam.label).width + 24;
                const labelX = canvasCenterX;
                const labelY = canvas.height - 50;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.beginPath();
                ctx.roundRect(labelX - labelW / 2, labelY - 20, labelW, 28, 14);
                ctx.fill();

                // Red accent line
                ctx.fillStyle = '#ff4444';
                ctx.fillRect(labelX - labelW / 2 + 8, labelY - 14, 3, 16);

                // Text
                ctx.fillStyle = '#ffffff';
                ctx.fillText(cam.label, labelX + 4, labelY + 4);
                ctx.globalAlpha = 1;
                ctx.restore();
            }

            // Game Over overlay
            if (isGameOver) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.fillStyle = '#ff4444';
                ctx.font = 'bold 48px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);

                const survivors = currentAgents.filter(a => a.role === 'HUMAN' && a.status === 'ALIVE');
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.font = '16px sans-serif';
                ctx.fillText(
                    survivors.length > 0 ? `생존자: ${survivors.length}명` : '생존자 없음...',
                    canvas.width / 2, canvas.height / 2 + 40
                );
            }

            // Announcement System
            const ann = announcementRef.current;
            if (ann && !isGameOver) {
                drawAnnouncement(ctx, canvas.width, canvas.height, ann.text, ann.style);
            }

            animId = requestAnimationFrame(animate);
        };

        animate();
        return () => cancelAnimationFrame(animId);
    }, [width, height]);

    // Click handler (adjusted for camera transform)
    const handleClick = useCallback((e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const screenX = (e.clientX - rect.left) * scaleX;
        const screenY = (e.clientY - rect.top) * scaleY;

        // Reverse camera transform to get world coordinates
        const cam = cameraRef.current;
        const canvasCenterX = canvas.width / 2;
        const canvasCenterY = canvas.height / 2;
        const worldX = (screenX - canvasCenterX) / cam.zoom + cam.x;
        const worldY = (screenY - canvasCenterY) / cam.zoom + cam.y;

        let closest: AgentClass | null = null;
        let closestDist = 2 * CELL_SIZE;

        agentsRef.current.forEach(agent => {
            const ax = agent.renderX * CELL_SIZE + CELL_SIZE / 2;
            const ay = agent.renderY * CELL_SIZE + CELL_SIZE / 2;
            const dx = worldX - ax;
            const dy = worldY - ay;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < closestDist) {
                closestDist = dist;
                closest = agent;
            }
        });

        if (closest) onAgentClick((closest as AgentClass).id);
    }, [onAgentClick]);

    return (
        <canvas
            ref={canvasRef}
            onClick={handleClick}
            className="absolute inset-0 block w-full h-full cursor-crosshair"
        />
    );
}

// === Camera Update Logic ===

function updateCamera(cam: CameraState, centerX: number, centerY: number) {
    // Zoom timer countdown
    if (cam.zoomTimer > 0) {
        cam.zoomTimer--;
        // Lerp toward target
        cam.x += (cam.targetX - cam.x) * CAM_LERP;
        cam.y += (cam.targetY - cam.y) * CAM_LERP;
        cam.zoom += (cam.targetZoom - cam.zoom) * CAM_LERP;
    } else {
        // Reset to center
        cam.targetZoom = 1;
        cam.targetX = centerX;
        cam.targetY = centerY;
        cam.x += (cam.targetX - cam.x) * CAM_RESET_LERP;
        cam.y += (cam.targetY - cam.y) * CAM_RESET_LERP;
        cam.zoom += (1 - cam.zoom) * CAM_RESET_LERP;
        cam.label = null;
    }

    // Shake
    if (cam.shakeDelay > 0) {
        cam.shakeDelay--;
        cam.shakeX = 0;
        cam.shakeY = 0;
    } else if (cam.shakeTimer > 0) {
        cam.shakeTimer--;
        const decay = cam.shakeTimer / 25; // fade out
        cam.shakeX = (Math.random() - 0.5) * cam.shakeIntensity * decay;
        cam.shakeY = (Math.random() - 0.5) * cam.shakeIntensity * decay;
    } else {
        cam.shakeX *= 0.8;
        cam.shakeY *= 0.8;
    }
}

// === Announcement Rendering ===

function drawAnnouncement(
    ctx: CanvasRenderingContext2D,
    canvasW: number, canvasH: number,
    text: string, style: AnnouncementStyle
) {
    const time = performance.now() * 0.001;

    if (style === 'COUNTDOWN') {
        const pulse = Math.sin(time * 6) * 0.08 + 1;
        const fontSize = 120 * pulse;

        ctx.save();
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowColor = '#ff4444';
        ctx.shadowBlur = 40;
        ctx.fillStyle = '#ff4444';
        ctx.fillText(text, canvasW / 2, canvasH / 2);

        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillText(text, canvasW / 2, canvasH / 2);
        ctx.restore();
        return;
    }

    if (style === 'DRAMATIC') {
        const pulse = Math.sin(time * 2) * 0.15 + 1;
        const boxW = Math.min(canvasW * 0.7, 540);
        const boxH = 90;
        const boxX = (canvasW - boxW) / 2;
        const boxY = canvasH / 2 - boxH / 2;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, boxY - 20, canvasW, boxH + 40);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.roundRect(boxX + 4, boxY + 4, boxW, boxH, 6);
        ctx.fill();

        ctx.fillStyle = 'rgba(5, 5, 20, 0.97)';
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 6);
        ctx.fill();

        const alpha = 0.7 + (pulse - 0.85) * 0.5;
        ctx.strokeStyle = `rgba(218, 165, 32, ${alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 6);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(218, 165, 32, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(boxX + 6, boxY + 6, boxW - 12, boxH - 12, 3);
        ctx.stroke();

        ctx.fillStyle = '#daa520';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('\u25C6', boxX + 10, boxY + 8);

        ctx.fillStyle = '#ffe8a0';
        ctx.font = 'bold 17px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvasW / 2, boxY + boxH / 2);

        if (Math.floor(time * 2) % 2 === 0) {
            const tw = ctx.measureText(text).width;
            ctx.fillStyle = '#daa520';
            ctx.fillRect(canvasW / 2 + tw / 2 + 6, boxY + boxH / 2 - 1, 10, 2);
        }
        return;
    }

    // SYSTEM style
    const boxW = Math.min(canvasW * 0.65, 480);
    const boxH = 80;
    const boxX = (canvasW - boxW) / 2;
    const boxY = canvasH / 2 - boxH / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.roundRect(boxX + 3, boxY + 3, boxW, boxH, 4);
    ctx.fill();

    ctx.fillStyle = 'rgba(8, 12, 40, 0.97)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 4);
    ctx.fill();

    ctx.strokeStyle = '#7080bb';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 4);
    ctx.stroke();

    ctx.strokeStyle = '#4a5580';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX + 5, boxY + 5, boxW - 10, boxH - 10, 2);
    ctx.stroke();

    ctx.fillStyle = '#7080bb';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('SYSTEM', boxX + 12, boxY + 10);

    ctx.fillStyle = '#e8e8ff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvasW / 2, boxY + boxH / 2 + 6);

    if (Math.floor(time * 2) % 2 === 0) {
        const tw = ctx.measureText(text).width;
        ctx.fillRect(canvasW / 2 + tw / 2 + 4, boxY + boxH / 2 + 4, 8, 2);
    }
}

function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
    ctx.font = '11px sans-serif';
    const padding = 8;
    const textWidth = ctx.measureText(text).width;
    const boxWidth = textWidth + padding * 2;
    const boxHeight = 22;
    const bx = x - boxWidth / 2;
    const by = y - boxHeight;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.roundRect(bx + 2, by + 2, boxWidth, boxHeight, 6);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.roundRect(bx, by, boxWidth, boxHeight, 6);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x - 4, by + boxHeight);
    ctx.lineTo(x, by + boxHeight + 5);
    ctx.lineTo(x + 4, by + boxHeight);
    ctx.fill();

    ctx.fillStyle = '#1a1a2e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, by + boxHeight / 2);
}
