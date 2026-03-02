function sketch(p, state) {
  const { WIDTH, HEIGHT, SEED, PARAMS, COLORS } = state;

  p.setup = () => {
    p.createCanvas(WIDTH, HEIGHT);
    p.noLoop();
  };

  p.draw = () => {
    p.background(COLORS[0]);
    p.fill(COLORS[1]);
    const size = PARAMS.size * WIDTH;
    p.ellipse(WIDTH / 2, HEIGHT / 2, size, size);
  };
}
