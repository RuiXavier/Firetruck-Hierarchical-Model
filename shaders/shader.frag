#version 300 es

precision mediump float;

uniform vec4 u_base_color;

in vec3 v_normal;

out vec4 frag_color;

void main() {
    frag_color = u_base_color;
}