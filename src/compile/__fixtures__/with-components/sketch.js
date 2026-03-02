function sketch(ctx, state) {
  const { WIDTH, HEIGHT, SEED, PARAMS } = state;
  const rng = mulberry32(SEED);
  const count = Math.floor(PARAMS.count);

  ctx.canvas.width = WIDTH;
  ctx.canvas.height = HEIGHT;
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < count; i++) {
    const x = rng() * WIDTH;
    const y = rng() * HEIGHT;
    drawDot(ctx, x, y, 4);
  }
}
