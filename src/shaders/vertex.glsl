uniform float size;
uniform sampler2D ground;
uniform sampler2D ceiling;
varying vec3 v_heightColor;

void main() {
  float xMin = 389400.0;
  float xMax = 408600.0;
  float yMin = 124200.0;
  float yMax = 148200.0;

  int aa = int(1000.0 * (position.x + position.y));
  int bb = 200;
  float xp = (position.x - xMin) / (xMax - xMin);
  float yp = 1.0 - (position.y - yMin) / (yMax - yMin);

  float zMin = texture2D(ground, vec2(xp, yp)).r * 65536.0 / 100.0;
  float zMax = texture2D(ceiling, vec2(xp, yp)).r * 65536.0 / 100.0;

  if(zMin > 327.68) {
    zMin -= 655.36;
  }
  if(zMax > 327.68) {
    zMax -= 655.36;
  }
  zMax = max(zMax, zMin + 20.0);

  float fuzz = float(aa - (bb * int(aa / bb)));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(size, size * (100.0 - float(bb / 2) + fuzz) / gl_Position.w);

  highp float height = (position.z - zMin) / (zMax - zMin) * 16581375.0;
  int h = int(height);
  if(h < 0) {
    h = 0;
  }
  int bi = (h / 65536);
  int gi = (h - bi * 65536) / 256;
  int ri = (h - bi * 65536 - gi * 256);
  float r = float(ri) / 256.0;
  float g = float(gi) / 256.0;
  float b = float(bi) / 256.0;
  v_heightColor = vec3(b, b, b);
}