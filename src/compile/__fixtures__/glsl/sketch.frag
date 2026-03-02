#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform float u_param1;
uniform vec3 u_color1;

out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float d = length(uv - 0.5);
  float ring = smoothstep(u_param1 - 0.01, u_param1, d) -
               smoothstep(u_param1, u_param1 + 0.01, d);
  fragColor = vec4(u_color1 * ring, 1.0);
}
