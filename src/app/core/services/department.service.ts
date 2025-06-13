import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Department } from '../models';

@Injectable({
  providedIn: 'root'
})
export class DepartmentService {
  
  private readonly departments: Department[] = [
    {
      id: 'bread',
      nameGerman: 'Brot',
      nameEnglish: 'Bread',
      icon: 'Baguette--Streamline-Core-Remix.png'
    },
    {
      id: 'fruit-vegetables',
      nameGerman: 'Obst & Gemüse',
      nameEnglish: 'Fruit and Vegetables',
      icon: 'Nutrition-Fruit-Orange--Streamline-Core-Remix.png'
    },
    {
      id: 'sausage-cheese-counter',
      nameGerman: 'Wurst & Käse Theke',
      nameEnglish: 'Sausage & Cheese Counter',
      icon: 'Sausage-Processed-Food--Streamline-Core-Remix.png'
    },
    {
      id: 'fridge-meat',
      nameGerman: 'Kühlschrank inkl. Fleisch etc.',
      nameEnglish: 'Fridge incl. meat etc',
      icon: 'Refrigerator--Streamline-Core.png'
    },
    {
      id: 'fish',
      nameGerman: 'Fisch',
      nameEnglish: 'Fish',
      icon: 'Allergens-Fish--Streamline-Core-Remix.png'
    },
    {
      id: 'dairy-products',
      nameGerman: 'Milchprodukte',
      nameEnglish: 'Dairy products',
      icon: 'Milk--Streamline-Core-Remix.png'
    },
    {
      id: 'spices-oils',
      nameGerman: 'Gewürze & Öle',
      nameEnglish: 'Spices & Oils',
      icon: 'Pepper-Bottle--Streamline-Core-Remix.png'
    },
    {
      id: 'noodles-rice',
      nameGerman: 'Nudeln & Reis',
      nameEnglish: 'Noodles & Rice',
      icon: 'Ramen-Dining--Streamline-Core-Remix.png'
    },
    {
      id: 'tins-jars',
      nameGerman: 'Konserven & Gläser (Bohnen, Mais, Oliven)',
      nameEnglish: 'Tins & jars',
      icon: 'Honey-Pot--Streamline-Core-Remix.png'
    },
    {
      id: 'pastries',
      nameGerman: 'Backwaren',
      nameEnglish: 'Pastries',
      icon: 'Pie--Streamline-Core-Remix.png'
    },
    {
      id: 'beverages-alcohol',
      nameGerman: 'Getränke & Alkohol',
      nameEnglish: 'Beverages & Alcohol',
      icon: 'Juice--Streamline-Core-Remix.png'
    },
    {
      id: 'frozen-goods',
      nameGerman: 'Tiefkühlwaren',
      nameEnglish: 'Frozen goods',
      icon: 'Snow-Flake--Streamline-Core-Remix.png'
    },
    {
      id: 'sweet-salty',
      nameGerman: 'Süßes & Salziges',
      nameEnglish: 'Sweet & Salty',
      icon: 'Candy--Streamline-Core-Remix.png'
    },
    {
      id: 'international',
      nameGerman: 'International',
      nameEnglish: 'International',
      icon: 'Earth-2--Streamline-Core-Remix.png'
    },
    {
      id: 'body-care',
      nameGerman: 'Körperpflege (Shampoo, Zahnbürsten)',
      nameEnglish: 'Body Care',
      icon: 'Pen-Types--Streamline-Core-Remix.png'
    },
    {
      id: 'cleaning-agents',
      nameGerman: 'Reinigungsmittel (Spülmittel)',
      nameEnglish: 'Cleaning Agents',
      icon: 'Hotel-Laundry--Streamline-Core-Remix.png'
    },
    {
      id: 'household-goods',
      nameGerman: 'Haushaltswaren (Klopapier, Küchenrolle)',
      nameEnglish: 'Household Goods',
      icon: 'Toilet-Paper--Streamline-Core-Remix.png'
    },
    {
      id: 'stationery',
      nameGerman: 'Schreibwaren (Stife, Hefte)',
      nameEnglish: 'Stationery',
      icon: 'Pencil-Square--Streamline-Core-Remix.png'
    },
    {
      id: 'breakfast',
      nameGerman: 'Frühstück',
      nameEnglish: 'Breakfast',
      icon: 'Croissant--Streamline-Core-Remix.png'
    },
    {
      id: 'baby',
      nameGerman: 'Baby',
      nameEnglish: 'Baby',
      icon: 'Face-Baby--Streamline-Core-Remix.png'
    },
    {
      id: 'pet-supplies',
      nameGerman: 'Tierbedarf',
      nameEnglish: 'Pet Supplies',
      icon: 'Cat-1--Streamline-Core-Remix.png'
    },
    {
      id: 'miscellaneous',
      nameGerman: 'Sonstiges',
      nameEnglish: 'Miscellaneous',
      icon: 'Help-Chat-2--Streamline-Core-Remix.png'
    },
    {
      id: 'season',
      nameGerman: 'Saison',
      nameEnglish: 'Season',
      icon: 'Brightness-4--Streamline-Core-Remix.png'
    },
    {
      id: 'medicine',
      nameGerman: 'Medizin',
      nameEnglish: 'Medicine',
      icon: 'Tablet-Capsule--Streamline-Core-Remix.png'
    },
    {
      id: 'drugstore',
      nameGerman: 'Drogerie',
      nameEnglish: 'Drugstore',
      icon: 'Ink-Bottle--Streamline-Core-Remix.png'
    }
  ];

  /**
   * Get all available departments
   */
  getDepartments(): Observable<Department[]> {
    return of(this.departments);
  }

  /**
   * Get a specific department by ID
   */
  getDepartment(id: string): Observable<Department | undefined> {
    const department = this.departments.find(d => d.id === id);
    return of(department);
  }

  /**
   * Get the display name for a department (useful for templates)
   */
  getDepartmentName(departmentId: string, language: 'german' | 'english' = 'german'): string {
    const department = this.departments.find(d => d.id === departmentId);
    if (!department) return '';
    
    return language === 'german' ? department.nameGerman : department.nameEnglish;
  }

  /**
   * Get the icon path for a department
   */
  getDepartmentIconPath(departmentId: string): string {
    const department = this.departments.find(d => d.id === departmentId);
    return department ? `/icons/${department.icon}` : '';
  }
}