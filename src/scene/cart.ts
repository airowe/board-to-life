type CartShape = { x: number; y: number; width: number; height: number; wheelRadius: number; angle: number };

export const cartWheels = (cart: CartShape): { x: number; y: number }[] => {
  const [cos, sin] = [Math.cos(cart.angle), Math.sin(cart.angle)];
  return [-1, 1].map((side) => {
    const [dx, dy] = [side * (cart.width / 2 - cart.wheelRadius), cart.height / 2];
    return { x: cart.x + dx * cos - dy * sin, y: cart.y + dx * sin + dy * cos };
  });
};
