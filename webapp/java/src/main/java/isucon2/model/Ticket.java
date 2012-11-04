package isucon2.model;

import java.io.Serializable;

public class Ticket implements Serializable {
	private static final long serialVersionUID = 1L;
	//basic
	int id;
	String name;
	
	//extended
	String artistName;
	int count;

	public int getId() {
		return id;
	}

	public void setId(int id) {
		this.id = id;
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public int getCount() {
		return count;
	}

	public void setCount(int count) {
		this.count = count;
	}

	public String getArtistName() {
		return artistName;
	}

	public void setArtistName(String artistName) {
		this.artistName = artistName;
	}
	
}
