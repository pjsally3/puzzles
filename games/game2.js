/* Red ball (existing) */
.dot {
  width: 62%;
  height: 62%;
  border-radius: 50%;
  background: #e53935;
}

/* Blue ball: outline only */
.blueDot {
  width: 62%;
  height: 62%;
  border-radius: 50%;
  border: 3px solid #1e88e5;
  background: transparent;
}

/* If both end up in same cell */
.cell.collide {
  outline: 3px solid #7b1fa2;
  outline-offset: -3px;
}

/* Optional: if you want both balls visible when stacked */
.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px; /* helps if both are in same cell */
}
