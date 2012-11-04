package isucon2.model;

import java.io.Serializable;

import java.util.Date;

public class OrderRequest implements Serializable {
	private static final long serialVersionUID = 1L;

	int id;
	int variationId;
	String memberId;
	String seatId;
	Date updatedAt;

	public int getId() {
		return id;
	}

	public void setId(int id) {
		this.id = id;
	}

	public int getVariationId() {
		return variationId;
	}

	public void setVariationId(int variationId) {
		this.variationId = variationId;
	}

	public String getMemberId() {
		return memberId;
	}

	public void setMemberId(String memberId) {
		this.memberId = memberId;
	}

	public String getSeatId() {
		return seatId;
	}

	public void setSeatId(String seatId) {
		this.seatId = seatId;
	}

	public Date getUpdatedAt() {
		return updatedAt;
	}

	public void setUpdatedAt(Date updatedAt) {
		this.updatedAt = updatedAt;
	}
}
