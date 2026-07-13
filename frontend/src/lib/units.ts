export const LB_PER_KG = 2.20462

export const kgToLbRounded = (kg: number) => Math.round(kg * LB_PER_KG)

export const lbToKg = (lb: number) => lb / LB_PER_KG

export const kgToLbExact = (kg: number) => kg * LB_PER_KG
kgToLbExact
