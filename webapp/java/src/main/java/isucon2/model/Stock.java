package isucon2.model;

import java.io.Serializable;

public class Stock implements Serializable {
	private static final long serialVersionUID = 1L;

	int variationId;
	String seatId;
	int orderId;

	public String getSeatId() {
		return seatId;
	}

	public void setSeatId(String seatId) {
		this.seatId = seatId;
	}

	public int getOrderId() {
		return orderId;
	}

	public void setOrderId(int orderId) {
		this.orderId = orderId;
	}

	public int getVariationId() {
		return variationId;
	}

	public void setVariationId(int variationId) {
		this.variationId = variationId;
	}

}
