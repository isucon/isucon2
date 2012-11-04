package isucon2.model;

import java.io.Serializable;
import java.util.Map;

public class Variation implements Serializable {
	private static final long serialVersionUID = 1L;

	//basic
	int id;
	String name;

	//extended
	Map<String, Boolean> stocks;
	long vacancy;

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

	public Map<String, Boolean> getStocks() {
		return stocks;
	}

	public void setStocks(Map<String, Boolean> stocks) {
		this.stocks = stocks;
	}

	public long getVacancy() {
		return vacancy;
	}

	public void setVacancy(long vacancy) {
		this.vacancy = vacancy;
	}

}
